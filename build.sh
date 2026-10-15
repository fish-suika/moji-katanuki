#!/bin/sh
# 分割ソースを1枚のHTMLに結合する
cd "$(dirname "$0")"

cat src/00-head.html \
    src/10-config.js \
    src/20-logic.js \
    src/25-fx.js \
    src/30-glyph.js \
    src/40-render.js \
    src/50-audio.js \
    src/55-store.js \
    src/60-ui.js \
    src/90-boot.js \
    src/99-tail.html > moji-katanuki.html
cp moji-katanuki.html index.html

# 検証ページ（DOM に依存する UI 以外）
cat src/verify-head.html \
    src/10-config.js \
    src/20-logic.js \
    src/25-fx.js \
    src/30-glyph.js \
    src/50-audio.js \
    src/55-store.js \
    src/verify-tests.js \
    src/99-tail.html > verify.html

echo "built moji-katanuki.html + index.html ($(wc -c < moji-katanuki.html) bytes)"
echo "built verify.html ($(wc -c < verify.html) bytes)"
