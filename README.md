<p align="center">
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/icon.png" width="128" alt="春蝉 ChunZen Logo" />
</p>

<h1 align="center">春蝉 ChunZen</h1>

<p align="center">
  <strong>在 VSCode 中沉浸式阅读学术 PDF，支持整页双语对照翻译、选中文字 AI 释义、期刊信息查询、术语表管理，让文献阅读更高效。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.6-blue" alt="Version" />
  <img src="https://img.shields.io/badge/VSCode-≥1.85.0-blue" alt="VSCode" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/summary.png" alt="春蝉预览" />
</p>

## 功能特性

### 实时翻译

- **整页翻译** — 在 PDF 中翻页即可翻译当前页所有段落，右侧面板支持原文/译文/双语对照三种视图
- **选中文字 AI 释义** — 在右侧译文区选中单词、术语或句子，弹出菜单可 **AI 解释**（先给译文，再给含义与背景解释）、划线高亮、写想法、记入术语表、复制。未配置大模型时自动降级为机器翻译
- **多引擎自动切换** — 按优先级依次尝试，首个成功即返回：
  - 百度翻译
  - AI 翻译（OpenAI 兼容接口，推荐 DeepSeek）
  - DeepL（免费/专业版；未配置时在设置中折叠，已有账号可展开配置）
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
- **段落悬停双向高亮** — 鼠标悬停在 PDF 段落或右侧对照面板上，双向同步高亮，方便中英文逐段/逐句对比阅读
- **表格图片回退** — 检测表格区域并截图为图片，避免乱码翻译
- **图片区域截图** — 工具栏截图按钮，手动截图当前页面的图注区域

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

1. 在项目的 **Releases** 页面下载最新打包的 `chunzen-*.vsix` 插件文件。
2. 打开 VS Code，进入扩展视图（`Cmd+Shift+X` 或 `Ctrl+Shift+X`），点击右上角的 `...` 更多操作菜单，选择 **从 VSIX 安装... (Install from VSIX...)**，导入下载好的 `.vsix` 文件完成安装。

   <p align="center">
     <img src="https://raw.githubusercontent.com/itcuihao/chunzen/main/media/install.png" alt="从 VSIX 安装插件" />
   </p>

3. 用 VS Code 打开任意 `.pdf` 文件，春蝉会自动接管渲染。
4. 在侧边栏 **设置** 中配置翻译引擎的 API Key。在 PDF 中划选任意英文句子，或在右侧面板点击 **翻译整页**，即可看到对应的翻译结果。

## 翻译引擎配置

### AI 翻译（OpenAI 兼容接口）

支持任何遵循 OpenAI `chat/completions` 格式的模型服务，侧边栏内置一键配置预设：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| Base URL | API 端点地址，**必填**（API Key 只会发往此地址）。根地址、带 `/v1` 的地址、完整 `/chat/completions` 地址都能识别 | 无 |
| API Key | 对应平台的密钥 | 无 |
| 模型名称 | 使用的模型，**必填**；可点“拉取模型列表”从接口返回的模型里挑 | 无 |
| 请求超时 | 单次请求超时（毫秒） | 60000 |
| 系统提示词 | 翻译风格指令 | 学术翻译专家提示词 |

设置面板左上角就是“测试连接”：先用 `GET /models` 校验地址与 Key 并列出可用模型，再发一次真实翻译验证链路。失败时会直接给出实际请求地址、状态码与可执行的下一步。

“拉取模型列表”会把服务商返回的模型渲染成可点选的标签，点一下就填进表单，避免手抄模型 ID 写错。

#### 网络不通时的排查

所有网络请求都走 `src/utils/fetch.ts` 的 `customFetch`，它会：

- 继承 VS Code 的 `http.proxy` 设置或 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量；
- 当前链路超时或拒绝连接时自动换另一条链路（代理 ↔ 直连、原生 `fetch` ↔ `node-fetch`）再试一次；
- 关闭 Node 20+ 的 `autoSelectFamily`（Happy Eyeballs）。部分服务商的域名有多条 A 记录，该特性会让请求一直等到整体超时，表现为 `fetch failed`，而 `curl` 正常；
- 把 `ETIMEDOUT` / `ENOTFOUND` / 自签名证书等底层错误翻译成可操作的中文提示，不再把裸 `fetch failed` 抛给界面。

#### 常用服务商推荐与一键预设：

- **DeepSeek 官方开放平台**
  - Base URL: `https://api.deepseek.com`
  - 推荐模型: `deepseek-chat`（推理模型 `deepseek-reasoner` 不支持 `temperature`，引擎会自动降级参数重试）
  - API Key: 在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 控制台获取。

- **智谱 GLM (BigModel)**
  - Base URL: `https://open.bigmodel.cn/api/paas/v4`
  - 推荐模型: `glm-4-flash`（另有 `glm-4.5`、`glm-5`、`glm-5.3-flash` 等，以控制台为准；点“拉取模型列表”可看到全部 12 个）
  - **新用户福利**：通过 [专属邀请链接](https://www.bigmodel.cn/invite?icode=PJ048yz3Fl63Urk70glapiUjscDI85ErLfUl7XNb00w%3D)（邀请码：`PJ048yz3Fl63Urk70glapiUjscDI85ErLfUl7XNb00w=`）注册，免费领取 2000 万 Tokens 大礼包。

- **硅基流动 (SiliconFlow)**
  - Base URL: `https://api.siliconflow.cn/v1`
  - 推荐模型: `Qwen/Qwen2.5-7B-Instruct`（模型名需带命名空间前缀）
  - **新用户福利**：通过 [专属邀请链接](https://cloud.siliconflow.cn/i/CZLEQUh5)（邀请码：`CZLEQUh5`）注册，免费获赠 2000 万 Tokens（14 元算力额度）。

- **Kimi（Moonshot）**
  - Base URL: `https://api.moonshot.cn/v1`
  - 推荐模型: `moonshot-v1-8k`

- **OpenAI 官方 / 任意中转**
  - Base URL: `https://api.openai.com/v1`（必须带 `/v1`）
  - 推荐模型: `gpt-4o-mini`


### 百度翻译

需要在 [百度翻译开放平台](https://fanyi-api.baidu.com) 注册获取 App ID 和密钥。

### DeepL

在 [DeepL](https://www.deepl.com/pro-api) 获取 API Key，支持免费版和专业版。

## 命令面板

| 命令 | 说明 |
|------|------|
| `春蝉: 截取当前图注区域` | 手动截图当前页面的图片区域，保存为 PNG |

## 键盘快捷键与阅读手势

| 按键 / 动作 | 功能 |
|------|------|
| `PageDown` / `Space` (触底) / `↓` (触底) | 翻至下一页 |
| `PageUp` / `Shift+Space` (触顶) / `↑` (触顶) | 翻至上一页 |
| `→` (触右边缘) | 翻至下一页 |
| `←` (触左边缘) | 翻至上一页 |
| 滚轮向下滚动 (触底) | 翻至下一页（带 800ms 防连刷冷却机制） |
| 滚轮向上滚动 (触顶) | 翻至上一页（带 800ms 防连刷冷却机制） |
| `+` / `=` | 放大页面 |
| `-` | 缩小页面 |

## 技术栈

- **Preact** + **@preact/signals** — 侧边栏 UI（~5KB）
- **PDF.js 3.11** — PDF 渲染引擎（CDN 加载）
- **Zustand** — 侧边栏状态管理
- **Tailwind CSS** — 样式系统
- **Webpack** — 多目标构建（extension / panel / pdfViewer）

## 支持作者

如果春蝉对您的科研工作有帮助，欢迎请作者喝杯咖啡

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
