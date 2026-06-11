#!/bin/bash
# TransLens Release Packager
# Creates a zip file ready for Chrome Web Store upload

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Version
VERSION="2.0"
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
zip -r "$ZIP_NAME" "${FILES[@]}"

# Verify
echo ""
echo "Package created: $ZIP_NAME"
echo "Size: $(ls -lh "$ZIP_NAME" | awk '{print $5}')"
echo ""
echo "Contents:"
unzip -l "$ZIP_NAME"

echo ""
echo "Ready for upload to Chrome Web Store!"
