# 高松市 天気ダッシュボード

高松市の天気・雲量・日照・雨リスクを確認し、外出や日焼け判断を補助する静的PWAです。

## v5で追加/修正した機能

- 既存の情報ページ型UIの上に、アプリらしい判断専用UIを追加
- 画面上部を「今から日焼けできるか」の結論カードへ変更
- 古い詳細ブロックは非表示化し、必要な情報だけを再構成
- 時間別は、時刻・狙い目/微妙・雲量・日照・UV・雨だけに整理
- 週間は小さな横スクロールカードに整理
- 公式確認と記録は最下部の2アクションに集約
- 360px幅でも横スクロール表に頼らない構成へ変更
- PWAキャッシュをv5へ更新

## v4で追加/修正した機能

- 360px幅を基準にしたスマホUI整理
- 最上部を「今どう判断するか」が先に分かる構成へ調整
- 文字量を削減し、説明文を短縮
- 時間別予報を横スクロール表から縦カードに変更
- 公式リンクとログを折りたたみ表示へ変更
- 現在天気の大きいカードを非表示化して、判断カードを優先

## v3で追加した機能

- 気象庁アメダス実測の取得
- 最寄りのアメダス観測点を自動選択
- 直近1時間の日照、降水、気温、湿度、風を表示
- 実測の日照が弱い場合は「晴れ予報でも曇り寄り」として補正
- 気象庁の雨雲の動き、ひまわり雲画像、アメダス地図への公式リンク
- 時間別表を「天気」ではなく「日差し判定」中心に変更
- 実際の空と日焼け結果をローカル保存するログ機能
- ログCSV出力

## 構成

- `index.html`：画面構造
- `style.css`：基本UI
- `enhancements.css`：v3/v4追加UI
- `v5.css`：v5アプリ型UI
- `app.js`：Open-Meteo取得、JMA比較、晴れ/雨リスク判定、描画処理
- `enhancements.js`：アメダス取得、公式リンク、日差しカード、ログ機能、折りたたみUI
- `v5.js`：判断専用UIの描画
- `manifest.webmanifest`：PWA設定
- `sw.js`：Service Worker
- `icons/icon.svg`：アプリアイコン

## データ取得

Open-Meteo API、Open-Meteo JMA API、気象庁アメダスをブラウザから直接取得します。GASやサーバーは不要です。

現在は以下を使用します。

```text
https://api.open-meteo.com/v1/forecast
https://api.open-meteo.com/v1/jma
https://www.jma.go.jp/bosai/amedas/data/latest_time.txt
https://www.jma.go.jp/bosai/amedas/const/amedastable.json
https://www.jma.go.jp/bosai/amedas/data/map/{YYYYMMDDHHMMSS}.json
```

通常Forecast API側は、降水確率に加えて、雲量、日照時間、短波放射、UV Indexも取得します。

JMA API側は日本向けモデル比較用です。JMA API側では取得できる変数が通常Forecast APIより少ないため、主に降水量・天気コード・雲量・日照時間・風速を使って判定しています。

アメダス側は、最寄りの観測点から直近の日照・降水・気温・湿度・風を取得し、日焼け判断を補正します。

## ローカルログ

実際の空と日焼け結果は、ブラウザの `localStorage` に保存されます。サーバーには送信しません。CSV出力で取り出せます。

## GitHub Pagesで公開する手順

1. GitHubのリポジトリ画面を開く
2. `Settings` を開く
3. 左メニューの `Pages` を開く
4. `Build and deployment` の `Source` を `Deploy from a branch` にする
5. Branchを `main`、フォルダを `/root` にする
6. `Save`
7. 数十秒〜数分後に公開URLが表示されます

公開URLの例：

```text
https://TAMAFIT.github.io/takamatsu-weather-pwa/
```

## スマホで使う

### Android

Chromeで公開URLを開き、メニューから「ホーム画面に追加」または「インストール」を選びます。

### iPhone

Safariで公開URLを開き、共有ボタンから「ホーム画面に追加」を選びます。

## 注意

このアプリは個人用の判断補助です。警報・雷雨時は気象庁などの公式情報も確認してください。気象庁のページ構成が変更された場合、アメダス取得や公式リンクは修正が必要になる可能性があります。
