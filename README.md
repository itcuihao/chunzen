<p align="center">
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/icon.png" width="128" alt="春蝉 ChunZen Logo" />
</p>

<h1 align="center">春蝉 ChunZen</h1>

<p align="center">
  <strong>在 VSCode 中沉浸式阅读学术 PDF，支持鼠标悬停实时翻译、期刊信息查询、术语表管理，让文献阅读更高效。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/VSCode-≥1.85.0-blue" alt="VSCode" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/summary.png" alt="春蝉预览" />
</p>

## 功能特性

### 实时翻译

- **鼠标悬停翻译** — 将鼠标悬停在英文句子上，300ms 后自动触发翻译
- **整页翻译** — 一键翻译当前页面所有段落，支持原文/译文/双语对照三种视图
- **多引擎自动切换** — 按优先级依次尝试，首个成功即返回：
  - 百度翻译
  - DeepL（免费/专业版）
  - AI 翻译（OpenAI 兼容接口，支持 MiniMax、Gemini 等）
  - Claude CLI
  - 自定义 HTTP 接口
- **拖拽排序引擎优先级** — 在设置面板中拖拽调整引擎顺序
- **翻译缓存** — LRU 内存缓存 + 磁盘持久化，避免重复请求
- **翻译历史** — 自动记录最近 100 条翻译，支持导出为 Markdown

### 期刊信息查询

- **自动提取 DOI/ISSN** — 从 PDF 首页文本中正则匹配
- **双数据源** — 科研通 (AbleSci) / LetPub，自动故障转移
- **期刊指标** — 影响因子、中科院分区、JCR 分区、预警状态
- **深度信息** — 自引率、审稿周期、录用率、出版社、投稿链接
- **论文元数据** — 发表年份、第一作者、通讯作者、所属机构

### 术语表

- **60+ 预置学术术语** — 覆盖 AI/CS、生物医学、化学、物理、通用学术 5 大类
- **自定义添加** — 手动添加术语对照，支持分类管理
- **文件导入** — 支持 CSV/TSV/TXT/JSON 格式批量导入
- **翻译时自动匹配** — LLM 引擎注入系统提示词，非 LLM 引擎后处理替换

### PDF 阅读体验

- **自定义 PDF 渲染器** — 基于 PDF.js 的 Canvas 渲染 + 文字层叠加
- **智能段落解析** — 多栏检测、标题识别、参考文献/表格/图注结构化识别
- **水平分隔线检测** — 从 PDF 矢量路径中提取，作为段落边界
- **噪声过滤** — 自动跳过页眉页脚、水印、作者机构信息
- **跨页重复文本检测** — 识别并隐藏跨页重复的边缘文本
- **表格图片回退** — 检测表格区域并截图为图片，避免乱码翻译
- **图片区域截图** — 工具栏 📷 按钮，手动截图当前页面的图注区域

### 侧边栏面板

- **翻译标签页** — 原文、译文、双语对照，支持整页翻译和自动翻页翻译
- **期刊标签页** — 期刊基本信息、深度指标、论文元数据，可折叠展示
- **术语标签页** — 术语列表、搜索过滤、分类标签、添加/编辑/删除
- **设置标签页** — 引擎配置（拖拽排序）、期刊数据源、版面解析、缓存管理

### 主题支持

- **暖色深色主题** — 深褐暖色调，长时间阅读更舒适
- **暖色浅色主题** — 奶油纸张色调，自然光环境下友好
- **自适应切换** — 跟随 VSCode 深色/浅色主题自动切换

## 快速开始

1. 在 VSCode 扩展市场搜索 **春蝉** 并安装
2. 打开任意 `.pdf` 文件，春蝉会自动接管渲染
3. 在侧边栏 **设置** 中配置翻译引擎的 API Key
4. 将鼠标悬停在英文句子上即可看到翻译结果

## 翻译引擎配置

### AI 翻译（OpenAI 兼容接口）

支持任何 OpenAI 兼容的 API，包括 MiniMax、Gemini、本地模型等：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 对应平台的密钥 | — |
| Base URL | API 端点地址 | `https://api.openai.com/v1` |
| 模型名称 | 使用的模型 | `gpt-4o-mini` |
| 系统提示词 | 翻译风格指令 | 学术翻译专家提示词 |

**MiniMax 示例配置：**
- Base URL: `https://api.minimaxi.com/v1`
- Model: `MiniMax-M2.7`
- API Key: 在 [MiniMax 开放平台](https://platform.minimaxi.com) 获取

### 百度翻译

需要在 [百度翻译开放平台](https://fanyi-api.baidu.com) 注册获取 App ID 和密钥。

### DeepL

在 [DeepL](https://www.deepl.com/pro-api) 获取 API Key，支持免费版和专业版。

### Claude CLI

需要本地安装 Claude CLI (`npm install -g @anthropic-ai/claude-cli`)，启用后通过命令行调用。

## 命令面板

| 命令 | 说明 |
|------|------|
| `春蝉: 截取当前图注区域` | 手动截图当前页面的图片区域，保存为 PNG |

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| `←` / `↑` | 上一页 |
| `→` / `↓` | 下一页 |

## 技术栈

- **Preact** + **@preact/signals** — 侧边栏 UI（~5KB）
- **PDF.js 3.11** — PDF 渲染引擎（CDN 加载）
- **Zustand** — 侧边栏状态管理
- **Tailwind CSS** — 样式系统
- **Webpack** — 多目标构建（extension / panel / pdfViewer）

## 支持作者

如果春蝉对您的科研工作有帮助，欢迎请作者喝杯咖啡 ☕

<p align="center">
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/alipay-qrcode.png" width="200" alt="支付宝" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/wechat-qrcode.png" width="200" alt="微信" />
</p>
<p align="center">
  <em>支付宝</em>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<em>微信</em>
</p>

## 反馈与贡献

- 问题反馈：[GitHub Issues](https://github.com/itcuihao/chunzen/issues)
- 功能建议：欢迎提交 Issue 讨论

## 许可证

MIT License
