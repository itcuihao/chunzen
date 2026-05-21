# VSCode 学术论文沉浸式阅读插件 — 规划方案

## 项目目标

构建一个 VSCode 插件，提供：
- 📄 **PDF 原文阅读**（左侧）
- 🌐 **实时翻译对比**（右侧面板，鼠标悬停高亮对应句）
- 📊 **论文信息查询**（影响因子、中科院分区等）
- 🧘 **沉浸式双栏体验**

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     VSCode Extension                     │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │   PDF Viewer     │    │   Side Panel (WebView)   │   │
│  │  (Custom Editor) │◄──►│                          │   │
│  │                  │    │  - 高亮当前句子           │   │
│  │  鼠标悬停 ──────►│    │  - 中文翻译               │   │
│  │                  │    │  - 论文信息（IF、分区）    │   │
│  └──────────────────┘    └──────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Extension Backend (Node.js)         │    │
│  │  - PDF 解析（pdf.js / pdfminer）                 │    │
│  │  - 翻译 API（DeepL / Google / 百度）             │    │
│  │  - 论文数据 API（CrossRef / 中科院分区数据库）    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 技术栈选型

### 1. 插件框架
| 技术 | 用途 |
|------|------|
| **TypeScript** | 插件主体开发语言（VSCode 官方推荐）|
| **VSCode Extension API** | 核心 API：Custom Editor、WebviewPanel、Hover |
| **Webpack / esbuild** | 打包构建 |

### 2. PDF 渲染
| 方案 | 优缺点 |
|------|--------|
| **PDF.js**（Mozilla）| ✅ 纯 JS、可在 WebView 中运行、文字层可交互 |
| ~~electron PDF~~ | ❌ VSCode 环境受限 |

> **推荐：PDF.js**，在 WebView 中嵌入，通过 `textLayer` 获取每一个文字 span 的位置和内容，实现鼠标悬停事件。

### 3. 句子分割 & 高亮
- 用 PDF.js 的 **textContent API** 提取每页文字块
- 用 **sentence-splitter** 或自定义正则对段落做句级切割
- 鼠标 `mouseover` 事件识别当前 span → 反查所属句子 → 高亮

### 4. 翻译 API
| API | 特点 |
|-----|------|
| **DeepL API** | 质量最高，免费额度 50万字/月 |
| **Google Translate API** | 稳定，需付费 |
| **百度翻译 API** | 国内免费额度大，适合学术场景 |
| **OpenAI / Gemini** | 可做学术专业翻译，理解上下文 |

> 建议：支持多 API 配置切换，用户在设置中填入自己的 Key。

### 5. 论文信息查询
| 数据源 | 提供信息 |
|--------|---------|
| **CrossRef API** | DOI 查询、影响因子基础数据、引用数 |
| **Semantic Scholar API** | 免费、影响因子、引用、摘要 |
| **Unpaywall API** | 开放获取状态 |
| **中科院分区** | 需要本地数据库（官方每年发布 Excel，可解析后内嵌）|
| **JCR / Web of Science** | 需订阅，可通过第三方数据聚合 |

> **中科院分区**：官方数据可从文献情报中心年度报告中获取，解析后做成本地 JSON 查询。

### 6. WebView 通信
```
PDF WebView  ──(postMessage)──►  Extension Host
    ▲                               |
    └──────(postMessage)────────────┘
```
- WebView → Extension：发送 `{type: 'hover', sentence: '...', doi: '...'}`
- Extension → WebView：返回 `{type: 'translation', text: '...', journalInfo: {...}}`

---

## 核心功能模块

### 模块一：PDF Custom Editor
```typescript
// 注册自定义编辑器，处理 .pdf 文件
vscode.window.registerCustomEditorProvider('myext.pdfViewer', provider)
```
- 打开 `.pdf` 文件时，用 WebView 渲染 PDF.js
- 提取 textLayer，每个句子用 `<span data-sentence-id="n">` 包裹

### 模块二：悬停事件 → 右侧面板同步
```
用户悬停某句
  → WebView postMessage 给 Extension
  → Extension 调用翻译 API（缓存已翻译）
  → Extension 查询论文信息（按 DOI）
  → 右侧 WebviewPanel 更新显示
```

### 模块三：论文信息面板
显示内容：
- 📰 期刊名 / ISSN
- 📈 影响因子（IF）
- 🏛️ 中科院分区（大类/小类）
- 📊 JCR 分区（Q1~Q4）
- 🔗 DOI 链接
- 👥 引用次数

### 模块四：翻译对比视图
- 右侧面板顶部：**原文高亮句**（英文）
- 中部：**中文翻译**（可选择不同翻译引擎）
- 底部：**词汇表**（专业术语对照）

---

## 开发阶段规划

### Phase 1 — MVP（2~3周）
- [ ] 插件脚手架（`yo code`）
- [ ] PDF.js 集成到 WebView
- [ ] 文字层鼠标悬停检测
- [ ] 右侧 Panel 基础框架
- [ ] 单一翻译 API（百度/DeepL）

### Phase 2 — 论文信息（1~2周）
- [ ] DOI 自动识别（从 PDF 提取）
- [ ] CrossRef / Semantic Scholar 查询
- [ ] 中科院分区本地数据库集成
- [ ] 信息面板 UI

### Phase 3 — 体验优化（1~2周）
- [ ] 翻译缓存（避免重复请求）
- [ ] 多翻译引擎切换
- [ ] 专业词汇高亮
- [ ] 键盘快捷键
- [ ] 主题适配（深色/浅色）

### Phase 4 — 发布
- [ ] VSCode Marketplace 发布（`vsce package`）
- [ ] README / 文档
- [ ] 用户设置 schema

---

## 项目结构

```
vscode-paper-reader/
├── src/
│   ├── extension.ts          # 插件入口
│   ├── pdfEditor/
│   │   ├── PdfEditorProvider.ts   # Custom Editor Provider
│   │   └── pdfViewer.html         # WebView HTML（含 PDF.js）
│   ├── sidePanel/
│   │   ├── SidePanelProvider.ts   # 右侧面板
│   │   └── panel.html             # 翻译+论文信息 UI
│   ├── services/
│   │   ├── translationService.ts  # 翻译 API 封装
│   │   ├── journalService.ts      # 论文信息查询
│   │   └── doiExtractor.ts        # DOI 自动提取
│   └── data/
│       └── cas-ranking.json       # 中科院分区本地数据
├── package.json              # 插件 manifest
└── webpack.config.js
```

---

## 关键难点 & 解决方案

| 难点 | 解决方案 |
|------|---------|
| PDF 文字层句子切割不准 | 结合位置坐标做段落重建，再句级切割 |
| 跨行句子高亮 | 用句子 ID 标记所有相关 span |
| 翻译 API 延迟 | 预翻译当前页 + LRU 缓存 |
| 中科院分区数据版权 | 引导用户自行导入官方 Excel |
| DOI 识别 | 正则 `10\.\d{4,}/\S+` + PDF metadata |

---

## 开放问题（需确认）

> [!IMPORTANT]
> 1. **翻译 API**：你是否有偏好的翻译服务？或者希望用 AI 翻译（如 Gemini/GPT）？
> 2. **中科院分区数据**：是否已有数据来源，或需要我帮你研究获取方式？
> 3. **MVP 优先级**：先做 PDF 阅读+翻译，还是论文信息查询更重要？
> 4. **是否需要现在开始搭建项目脚手架？**
