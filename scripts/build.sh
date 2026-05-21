#!/usr/bin/env bash
set -euo pipefail

LOCAL_MODE=false
if [[ "${1:-}" == "local" ]]; then
  LOCAL_MODE=true
fi

echo "=== ChunZen VSIX Builder ==="

# 1. Clean dist and old vsix
echo "[1/4] Cleaning..."
rm -rf dist/
rm -f chunzen-*.vsix

# 2. Build webpack bundles
echo "[2/4] Building webpack bundles..."
npx webpack --mode production --devtool hidden-source-map

# 3. Package VSIX
echo "[3/4] Packaging VSIX..."
node -e "
const vsce = require('@vscode/vsce');
vsce.createVSIX({ useYarn: false, allowMissingRepository: true }).then(() => console.log('packaged')).catch(e => { console.error(e.message); process.exit(1); });
"

PACKAGE_FILE=$(ls chunzen-*.vsix 2>/dev/null | head -1)
if [[ -z "$PACKAGE_FILE" ]]; then
  echo "ERROR: VSIX file not generated"
  exit 1
fi

echo "[4/4] Done."
ls -lh "$PACKAGE_FILE"

if $LOCAL_MODE; then
  echo ""
  echo "Installing to local VSCode..."
  code --uninstall-extension chunzen.chunzen 2>/dev/null || true
  code --install-extension "$PACKAGE_FILE" --force
  echo "Installed. Reload any open VSCode windows to apply."
else
  echo ""
  echo "Install: code --install-extension $PACKAGE_FILE"
fi