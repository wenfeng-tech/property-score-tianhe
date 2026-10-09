#!/bin/bash
# 一键部署：构建 → 推送源码到 main → 推送产物到 gh-pages（GitHub Pages 自动更新）
set -e
cd "$(dirname "$0")"

echo "==> 构建生产版本…"
npm run build

echo "==> 推送源码到 main…"
git add -A
git diff --cached --quiet || git commit -m "update: $(date '+%Y-%m-%d %H:%M')"
git push origin main

echo "==> 推送产物到 gh-pages…"
cd dist
git add -A
git diff --cached --quiet || git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
git push -f origin gh-pages

echo ""
echo "✅ 已推送，约 1 分钟后生效："
echo "   https://wenfeng-tech.github.io/property-score-tianhe/"
