# 高松天気チェッカー real-bg clean

このZIPは、ユーザーが生成した4枚の背景画像をWebP化して組み込んだクリーン版です。

## 残すファイル/フォルダ

- assets/
  - bg-sunny.webp
  - bg-cloudy.webp
  - bg-rain.webp
  - bg-night.webp
- icons/
- .nojekyll
- app.js
- index.html
- manifest.webmanifest
- README_DEPLOY.md
- style.css
- sw.js

## 削除していい旧ファイル

- assets_micro/
- assets_small/
- assets_tiny/
- enhancements.css
- enhancements.js
- v5.css
- v5.js
- v8.css
- v9.js
- theme.js
- README.md

## 重要

この版の index.html は theme.js を読み込みません。
背景切り替えと「夜背景は今日だけ」は app.js 側に入っています。

反映後の確認:
https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=real-bg1
