#!/bin/bash

# ローカルプラグインをインストールするスクリプト
# 使い方: ./install-local.sh <plugin-folder-name>
#
# 例: ./install-local.sh hello-plugin

PLUGIN_NAME=$1
PLUGINS_DIR="$HOME/Library/Application Support/Window Board/plugins"
REGISTRY_FILE="$PLUGINS_DIR/plugins.json"

if [ -z "$PLUGIN_NAME" ]; then
  echo "使い方: ./install-local.sh <plugin-folder-name>"
  echo "例: ./install-local.sh hello-plugin"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/$PLUGIN_NAME"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "エラー: $SOURCE_DIR が見つかりません"
  exit 1
fi

# manifest.json から id を取得
PLUGIN_ID=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$SOURCE_DIR/manifest.json" | sed 's/.*"\([^"]*\)"$/\1/')

if [ -z "$PLUGIN_ID" ]; then
  echo "エラー: manifest.json から id を取得できません"
  exit 1
fi

TARGET_DIR="$PLUGINS_DIR/$PLUGIN_ID"

echo "プラグインをインストール中..."
echo "  ソース: $SOURCE_DIR"
echo "  ターゲット: $TARGET_DIR"
echo "  プラグインID: $PLUGIN_ID"

# プラグインディレクトリを作成
mkdir -p "$PLUGINS_DIR"

# 既存のプラグインを削除
if [ -d "$TARGET_DIR" ]; then
  echo "  既存のプラグインを削除..."
  rm -rf "$TARGET_DIR"
fi

# コピー
cp -r "$SOURCE_DIR" "$TARGET_DIR"

# plugins.json を更新
echo "  レジストリを更新..."

TIMESTAMP=$(date +%s)000

if [ -f "$REGISTRY_FILE" ]; then
  # 既存のレジストリを読み込み、プラグインを追加/更新
  # jq がない場合は手動で処理
  if command -v jq &> /dev/null; then
    # jq がある場合
    jq --arg id "$PLUGIN_ID" --arg ts "$TIMESTAMP" \
      '.plugins[$id] = {enabled: false, installedAt: ($ts | tonumber), updatedAt: ($ts | tonumber), settings: {}}' \
      "$REGISTRY_FILE" > "$REGISTRY_FILE.tmp" && mv "$REGISTRY_FILE.tmp" "$REGISTRY_FILE"
  else
    # jq がない場合、Python を使用
    python3 << EOF
import json
import os

registry_file = "$REGISTRY_FILE"
plugin_id = "$PLUGIN_ID"
timestamp = $TIMESTAMP

try:
    with open(registry_file, 'r') as f:
        registry = json.load(f)
except:
    registry = {"version": 1, "plugins": {}}

registry["plugins"][plugin_id] = {
    "enabled": False,
    "installedAt": timestamp,
    "updatedAt": timestamp,
    "settings": {}
}

with open(registry_file, 'w') as f:
    json.dump(registry, f, indent=2)
EOF
  fi
else
  # 新規作成
  cat > "$REGISTRY_FILE" << EOF
{
  "version": 1,
  "plugins": {
    "$PLUGIN_ID": {
      "enabled": false,
      "installedAt": $TIMESTAMP,
      "updatedAt": $TIMESTAMP,
      "settings": {}
    }
  }
}
EOF
fi

echo ""
echo "✅ インストール完了！"
echo ""
echo "次のステップ:"
echo "  1. Window Board を再起動（または Cmd+R でリロード）"
echo "  2. Cmd + , で設定を開く"
echo "  3. プラグインタブで「$PLUGIN_ID」を有効化"
