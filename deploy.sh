#!/bin/bash
# 一键部署：构建 → 推送源码到 main → 推送产物到 gh-pages（GitHub Pages 自动更新）
set -e
cd "$(dirname "$0")"

echo "==> 构建生产版本…"
npm run build

echo "==> 推送源码到 main…"
git add -A
git diff --cached --quiet || git commit -m "update: $(date '+%Y-%m-%d %H:%M')"
# 本地代理可用则走代理，否则直连
PROXY=$(git config --get http.proxy || true)
if [ -n "$PROXY" ] && ! nc -z $(echo "$PROXY" | sed -E 's|.*://([^:/]+):([0-9]+).*|\1 \2|') 2>/dev/null; then
  echo "   （代理 $PROXY 不可用，本次直连推送）"
  git -c http.proxy= -c https.proxy= push origin main
else
  git push origin main
fi

echo "==> 推送产物到 gh-pages…"
cd dist
git add -A
git diff --cached --quiet || git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
if [ -n "$PROXY" ] && ! nc -z $(echo "$PROXY" | sed -E 's|.*://([^:/]+):([0-9]+).*|\1 \2|') 2>/dev/null; then
  git -c http.proxy= -c https.proxy= push -f origin gh-pages
else
  git push -f origin gh-pages
fi

echo ""
echo "✅ 已推送，约 1 分钟后生效："
echo "   https://wenfeng-tech.github.io/property-score-tianhe/"
