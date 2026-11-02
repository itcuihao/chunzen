# 春蝉 (ChunZen) 扩展发布指南

本文档记录春蝉发布新版本的完整标准流程与注意事项。

---

## 一、发布准备流程

### 1. 更新版本号与打标签
使用 npm 或内置发布辅助脚本：
```bash
# 升级补丁版本 (例如 0.1.5 -> 0.1.6)
npm version patch -m "chore: release v%s"

# 或指定版本号
npm version 0.1.6 -m "chore: release v%s"
```

### 2. 打包生成 `.vsix` 文件
在项目根目录下执行：
```bash
npm run vsix
```
打包成功后，将在根目录下生成 `chunzen-<版本号>.vsix` 文件。

### 3. 推送代码与标签至远程仓库
```bash
git push origin main && git push origin --tags
git push github main && git push github --tags
```
> **提示**：GitHub Actions 会在捕获到 `v*` 标签后自动执行编译，并在 GitHub 仓库的 **Releases** 页面自动发布该版本的 `.vsix` 下载包。

---

## 二、发布到微软官方商店 (VS Code Marketplace)

微软官方支持直接通过网页管理后台上传更新，**无需配置 Azure DevOps 组织，无需国际信用卡绑定，无需管理每年过期的 PAT Token**。

### 网页上传更新步骤：

1. **登录微软扩展管理后台**：
   👉 打开 **[Visual Studio Marketplace Manage](https://marketplace.visualstudio.com/manage)**
   - 使用发布者账号登录（例如 `HaoC_it@hotmail.com`）。

2. **找到发布者与插件**：
   - 在左侧或页面中找到 Publisher：**`HaoC`**
   - 在列表中找到插件：**`chunzen`**

3. **上传新版本**：
   - 点击插件右侧的 **`...` 更多操作按钮**，选择 **Update (更新)**。
   - 将本地刚生成的 `chunzen-<版本号>.vsix`（或直接从 GitHub Releases 下载的 `.vsix` 文件）拖拽上传。
   - 点击 **Upload** 提交。

4. **等待审核生效**：
   - 提交后，状态会短暂显示为 `Verifying`（微软安全扫描与元数据校验）。
   - 通常 **5 ~ 10 分钟** 内完成扫描，状态变为绿色即表示已在全球 VS Code 扩展市场生效上线！

---

## 三、常见排错与注意事项

1. **版本号必须递增**：
   - 微软商店不允许覆盖同名同版本号文件。如果上传报错提示版本已存在，请确认 `package.json` 中的 `version` 大于商店当前版本。

2. **`README.md` 与 `CHANGELOG.md`**：
   - VS Code Marketplace 详情页与变更记录会直接从打包的 `.vsix` 内读取 `README.md` 和 `CHANGELOG.md`，发布前建议同步更新版本说明。

3. **依赖打包检查**：
   - 扩展使用 Webpack 打包所有源码至 `dist/`，打包脚本已配置 `--no-dependencies`，无需将生产 node_modules 全部塞入安装包，保持体积轻量。
