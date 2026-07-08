# 高松 海日和 PWA クリーン版

このZIPの中身でリポジトリを丸ごと入れ替えてください。

## 入れるファイル
- index.html
- style.css
- app.js
- manifest.webmanifest
- sw.js
- icons/icon.svg
- .nojekyll

## 確認URL
https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=10-clean

過去キャッシュが残る場合は、PWAを一度削除するか、ブラウザのサイトデータを削除してください。

## 仕様
- 高松固定
- 9:00〜17:00を海・日焼け時間として評価
- 内部は1時間ごと
- 16日分の週間カード
- 通常予報 / JMA / 海況 / アメダスを取得
- 取得失敗しても白画面にしない
