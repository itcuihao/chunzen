#!/usr/bin/env bash
set -euo pipefail

LOCAL_MODE=false
if [[ "${1:-}" == "local" ]]; then
  LOCAL_MODE=true
fi

echo "=== ChunZen VSIX Builder ==="

# 1. Clean dist and old vsix
echo "[1/5] Cleaning..."
rm -rf dist/
rm -f chunzen-*.vsix

# 2. Generate build info
echo "[2/5] Generating build info..."
VERSION=$(node -p "require('./package.json').version")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M")
cat > src/build-info.ts << EOF
export const BUILD_INFO = {
  version: '${VERSION}',
  hash: '${GIT_HASH}',
  date: '${BUILD_DATE}',
};
EOF
echo "  version=${VERSION}  hash=${GIT_HASH}  date=${BUILD_DATE}"

# 3. Build webpack bundles
echo "[3/5] Building webpack bundles..."
npx webpack --mode production --devtool hidden-source-map

# 4. Package VSIX
echo "[4/5] Packaging VSIX..."
node -e "
const vsce = require('@vscode/vsce');
vsce.createVSIX({ useYarn: false, allowMissingRepository: true }).then(() => console.log('packaged')).catch(e => { console.error(e.message); process.exit(1); });
"

PACKAGE_FILE=$(ls chunzen-*.vsix 2>/dev/null | head -1)
if [[ -z "$PACKAGE_FILE" ]]; then
  echo "ERROR: VSIX file not generated"
  exit 1
fi

# 5. Output MD5 and info
echo "[5/5] Done."
echo ""
MD5=$(md5 -q "$PACKAGE_FILE" 2>/dev/null || md5sum "$PACKAGE_FILE" | cut -d' ' -f1)
ls -lh "$PACKAGE_FILE"
echo ""
echo "=== Build Info ==="
echo "  Version : ${VERSION}"
echo "  Git     : ${GIT_HASH}"
echo "  Date    : ${BUILD_DATE}"
echo "  VSIX    : ${PACKAGE_FILE}"
echo "  MD5     : ${MD5}"
echo "=================="

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
