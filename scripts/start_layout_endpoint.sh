#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${REPO_ROOT}/.venv-layout"
PY_BIN="${VENV_DIR}/bin/python"
PIP_BIN="${VENV_DIR}/bin/pip"

echo "[Chunzen] Workspace: ${REPO_ROOT}"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "[1/4] Creating virtual env: ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
else
  echo "[1/4] Virtual env exists: ${VENV_DIR}"
fi

echo "[2/4] Installing base deps..."
"${PIP_BIN}" install --upgrade pip
"${PIP_BIN}" install fastapi "uvicorn[standard]" pillow numpy

echo "[3/4] Checking Paddle deps..."
if ! "${PY_BIN}" -c "import paddleocr, paddle; print('ok')" >/dev/null 2>&1; then
  echo "[Chunzen] Installing paddlepaddle + paddleocr (first run may take a while)..."
  "${PIP_BIN}" install paddlepaddle paddleocr
else
  echo "[Chunzen] Paddle deps already installed."
fi

echo "[4/4] Starting local layout endpoint on 127.0.0.1:8765 ..."
cd "${REPO_ROOT}"
exec "${VENV_DIR}/bin/uvicorn" scripts.layout_endpoint:app --host 127.0.0.1 --port 8765

