#!/usr/bin/env python3
"""
Local layout endpoint for Chunzen MVP.

Run:
  python3 -m venv .venv
  source .venv/bin/activate
  pip install fastapi "uvicorn[standard]" pillow numpy paddleocr paddlepaddle
  uvicorn scripts.layout_endpoint:app --host 127.0.0.1 --port 8765

The endpoint accepts PDF page image (base64) + text items, and returns:
  { "columnsCount": 1|2, "gutters": [...], "sidebarGutterX": number? }
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

try:
    from paddleocr import PPStructure  # type: ignore
except Exception:
    PPStructure = None


class LayoutRequest(BaseModel):
    pageNumber: int = 1
    imageBase64: Optional[str] = None
    imageMimeType: Optional[str] = None
    imageWidth: Optional[int] = None
    imageHeight: Optional[int] = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    viewport: Optional[dict[str, Any]] = None


@dataclass
class Box:
    x1: float
    y1: float
    x2: float
    y2: float
    label: str = "text"

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def w(self) -> float:
        return self.x2 - self.x1


app = FastAPI(title="Chunzen Layout Endpoint")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
_engine: Any = None
_engine_init_error: Optional[str] = None


def get_engine() -> Any:
    global _engine, _engine_init_error
    if _engine is not None or _engine_init_error is not None:
        return _engine
    if PPStructure is None:
        _engine_init_error = "paddleocr not installed"
        return None
    try:
        # Keep MVP simple: full structure pipeline, then we only read bbox/type.
        _engine = PPStructure(show_log=False)
    except Exception as e:  # pragma: no cover
        _engine_init_error = str(e)
        _engine = None
    return _engine


def decode_image(base64_str: str) -> np.ndarray:
    data = base64.b64decode(base64_str)
    img = Image.open(BytesIO(data)).convert("RGB")
    arr = np.array(img)
    # PPStructure generally expects BGR ndarray.
    return arr[:, :, ::-1]


def kmeans_1d(values: list[float], k: int) -> tuple[list[float], float]:
    if not values:
        return [], 0.0
    vals = sorted(values)
    centers = [vals[min(len(vals) - 1, int((i + 0.5) * len(vals) / k))] for i in range(k)]
    assign = [0] * len(values)

    for _ in range(10):
        for i, v in enumerate(values):
            best = min(range(k), key=lambda c: abs(v - centers[c]))
            assign[i] = best
        for c in range(k):
            members = [values[i] for i in range(len(values)) if assign[i] == c]
            if members:
                centers[c] = sum(members) / len(members)

    sse = 0.0
    for i, v in enumerate(values):
        d = v - centers[assign[i]]
        sse += d * d
    return centers, sse


def infer_columns_from_centers(centers: list[float]) -> int:
    if len(centers) < 6:
        return 1
    c1, s1 = kmeans_1d(centers, 1)
    _, s2 = kmeans_1d(centers, 2)
    _, s3 = kmeans_1d(centers, 3)
    variance = max(1.0, s1 / len(centers))
    score1 = s1 + variance * 0.08
    score2 = s2 + variance * 0.16
    score3 = s3 + variance * 0.24
    best = min(score1, score2, score3)
    k = 1 if best == score1 else (2 if best == score2 else 3)
    improvement = (score1 - best) / max(score1, 1.0)
    if k > 1 and improvement < 0.18:
        return 1
    return min(2, k)


def hints_from_boxes(boxes: list[Box], page_width: float) -> dict[str, Any]:
    if len(boxes) < 4:
        return {"columnsCount": 1}

    text_boxes = [b for b in boxes if not any(x in b.label for x in ["table", "figure", "chart", "formula", "image"])]
    use_boxes = text_boxes if len(text_boxes) >= 4 else boxes
    centers = [b.cx for b in use_boxes]
    cols = infer_columns_from_centers(centers)
    if cols <= 1:
        return {"columnsCount": 1}

    km_centers, _ = kmeans_1d(centers, cols)
    km_centers = sorted(km_centers)
    gutters: list[float] = []
    for i in range(len(km_centers) - 1):
        g = (km_centers[i] + km_centers[i + 1]) / 2
        if page_width * 0.12 < g < page_width * 0.88:
            gutters.append(float(g))

    payload: dict[str, Any] = {
        "columnsCount": cols,
        "gutters": gutters,
    }
    if cols == 2 and len(gutters) == 1:
        g = gutters[0]
        left = [b for b in use_boxes if b.cx < g]
        right = [b for b in use_boxes if b.cx >= g]
        if left and right:
            right_avg_w = sum(b.w for b in right) / len(right)
            if right_avg_w < page_width * 0.42 and len(right) <= len(left) * 0.8:
                payload["sidebarGutterX"] = g
    return payload


def parse_boxes_from_ppstructure(result: Any) -> list[Box]:
    boxes: list[Box] = []
    if not isinstance(result, list):
        return boxes
    for row in result:
        if not isinstance(row, dict):
            continue
        bbox = row.get("bbox")
        if not isinstance(bbox, list) or len(bbox) < 4:
            continue
        nums = [float(x) for x in bbox[:4]]
        x1, y1, x2, y2 = nums
        if x2 <= x1 or y2 <= y1:
            continue
        label = str(row.get("type", "text")).lower()
        boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, label=label))
    return boxes


def hints_from_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    xs: list[float] = []
    for it in items:
        tf = it.get("transform")
        if isinstance(tf, list) and len(tf) >= 6:
            try:
                xs.append(float(tf[4]))
            except Exception:
                pass
    if len(xs) < 20:
        return {"columnsCount": 1}
    cols = infer_columns_from_centers(xs)
    return {"columnsCount": cols}


@app.post("/layout")
def layout(req: LayoutRequest) -> dict[str, Any]:
    page_width = float(req.imageWidth or (req.viewport or {}).get("width") or 1200.0)
    engine = get_engine()

    if engine is not None and req.imageBase64:
        try:
            image = decode_image(req.imageBase64)
            result = engine(image)
            boxes = parse_boxes_from_ppstructure(result)
            hints = hints_from_boxes(boxes, page_width)
            hints["engine"] = "paddleocr"
            hints["boxCount"] = len(boxes)
            return hints
        except Exception as e:
            # Fall back to item-based heuristic.
            fallback = hints_from_items(req.items)
            fallback["engine"] = "fallback-items"
            fallback["error"] = str(e)
            return fallback

    fallback = hints_from_items(req.items)
    fallback["engine"] = "fallback-items"
    if _engine_init_error:
        fallback["warning"] = _engine_init_error
    return fallback
