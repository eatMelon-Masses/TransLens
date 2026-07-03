#!/bin/bash
# TransLens Release Packager
# Creates a zip file ready for Chrome Web Store upload

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Version — 优先用环境变量（CI 注入），否则取 manifest.json
if [[ -n "$VERSION" ]]; then
  : # 已由 CI 注入
else
  VERSION=$(node -p "require('./manifest.json').version" 2>/dev/null || echo "dev")
fi
ZIP_NAME="TransLens-${VERSION}.zip"

# Files to include
FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup.html"
  "popup.js"
  "settings.html"
  "settings.js"
  "settings.css"
  "icon48.png"
  "icon128.png"
  "privacy.html"
  "_locales/en/messages.json"
  "_locales/zh_CN/messages.json"
)

# Check all required files exist
echo "Checking required files..."
for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Missing file: $file"
    exit 1
  fi
done

echo "All files present!"

# Remove old zip if exists
rm -f "$ZIP_NAME"

# Create zip
echo "Creating $ZIP_NAME..."
COPYFILE_DISABLE=1 zip -r "$ZIP_NAME" "${FILES[@]}" -x "*/__MACOSX/*" "*/._*"

# Verify
echo ""
echo "Package created: $ZIP_NAME"
echo "Size: $(ls -lh "$ZIP_NAME" | awk '{print $5}')"
echo ""
echo "Contents:"
unzip -l "$ZIP_NAME"

if unzip -l "$ZIP_NAME" | grep -E '(__MACOSX|/\._|^.*\._)' >/dev/null; then
  echo "ERROR: Package contains macOS metadata files."
  exit 1
fi

echo ""
echo "Ready for upload to Chrome Web Store!"
