# 高松天気チェッカー mock UI v3

v2の実機確認で出た問題を修正した版です。

## 修正内容

- 1時間カード右端の矢印を削除
- 雲 / 日照 / UV / 雨 の数値が `...` になりにくいレイアウトへ変更
- 評価ごとに1時間カードの天気アイコンを変更
  - 最高: 太陽
  - 良い: 太陽＋小さい雲
  - 微妙: 雲が強い太陽
  - 弱い: 曇り/雨系
- 1時間判定のしきい値を少し現実寄りに調整
- 4指標カードを白く強めに調整
- 絵文字装飾を減らし、一部SVGアイコン化
- 背景WebP、API取得、9:00〜17:00判定、夜背景は今日だけ、は維持

## GitHub上で残すファイル

- assets/
- icons/
- .nojekyll
- app.js
- index.html
- manifest.webmanifest
- README_DEPLOY.md
- style.css
- sw.js

## 確認URL

https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=mock-ui3
