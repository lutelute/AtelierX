#!/bin/bash

# AtelierX Release Script
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

echo "🚀 AtelierX Release Script"
echo "=========================="
echo "Version type: $VERSION_TYPE"
echo ""

# 1. Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "⚠️  Uncommitted changes detected. Please commit or stash them first."
  exit 1
fi

# 2. Update version
echo "📦 Updating version..."
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version | sed 's/v//')
echo "   New version: $NEW_VERSION"

# 3. Build the app
echo ""
echo "🔨 Building the app..."
rm -rf release
npm run electron:build:mac

# 4. Commit version change
echo ""
echo "📝 Committing changes..."
git add package.json package-lock.json
git commit -m "chore: release v$NEW_VERSION"

# 5. Create git tag
echo ""
echo "🏷️  Creating tag..."
git tag "v$NEW_VERSION"

# 6. Push to remote
echo ""
echo "⬆️  Pushing to remote..."
git push origin main
git push origin "v$NEW_VERSION"

# 7. Create GitHub release with DMG
echo ""
echo "🎉 Creating GitHub release..."
DMG_FILE="release/AtelierX-$NEW_VERSION-universal.dmg"

if [[ -f "$DMG_FILE" ]]; then
  gh release create "v$NEW_VERSION" "$DMG_FILE" \
    --title "v$NEW_VERSION" \
    --generate-notes
  echo ""
  echo "✅ Release v$NEW_VERSION created successfully!"
  echo "   https://github.com/lutelute/AtelierX/releases/tag/v$NEW_VERSION"
else
  echo "❌ DMG file not found: $DMG_FILE"
  exit 1
fi
