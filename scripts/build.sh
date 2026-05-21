#!/usr/bin/env bash
set -euo pipefail

LOCAL_MODE=false
if [[ "${1:-}" == "local" ]]; then
  LOCAL_MODE=true
fi

echo "=== ChunZen VSIX Builder ==="

# 1. Clean
echo "[1/4] Cleaning dist..."
rm -rf dist/

# 2. Build webpack bundles
echo "[2/4] Building webpack bundles..."
npx webpack --mode production --devtool hidden-source-map

# 3. Package VSIX
echo "[3/4] Packaging VSIX..."
node ./node_modules/@vscode/vsce/out/main.js package

# 4. Show result
VSIX_FILE=$(ls -t chunzen-*.vsix | head -1)

echo "[4/4] Done."
ls -lh "$VSIX_FILE"

if $LOCAL_MODE; then
  echo ""
  echo "Installing to local VSCode..."
  code --install-extension "$VSIX_FILE" --force
  echo "Installed. Reload any open VSCode windows to apply."
else
  echo ""
  echo "Install: code --install-extension $VSIX_FILE"
fi