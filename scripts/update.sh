#!/bin/bash
# 春蝉插件一键重新编译 + 安装
# 用法：bash update.sh

set -e

echo "🔨 重新编译..."
npm run compile

echo "📦 打包..."
npm run vsix

echo "🔄 卸载旧版..."
code --uninstall-extension chunzen.chunzen 2>/dev/null || true

echo "✅ 安装新版..."
code --install-extension chunzen-0.1.0.vsix

echo ""
echo "🌸 春蝉已更新！请在 VSCode 中执行："
echo "   Cmd+Shift+P → Reload Window"
