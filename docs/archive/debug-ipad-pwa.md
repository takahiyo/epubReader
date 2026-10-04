# iPad PWAインストール改善 デバッグ・テスト記録

## 実装した工程 (2026/06/01)

1. **iOS/iPadOS向けPWA対応メタタグの追加**:
   - `index.html` の `<head>` 内に、iOS/iPadOSでホーム画面追加時にスタンドアロン起動させるための以下のメタタグを追加しました。
     - `<meta name="apple-mobile-web-app-capable" content="yes">`
     - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
     - `<meta name="apple-mobile-web-app-title" content="BookReader">`

## ユーザーテスト・操作手順

iPadでPWAとして動作させるため、以下の手順をお試しください。

1. **Safariでアクセスする**:
   - iPad上の **Safariブラウザ** でBookReaderのWebサイトを開きます。
   - ※iOSの仕様上、Safari以外のブラウザ（Chrome等）でもバージョンによって可能ですが、Safariから行うのが最も確実です。
2. **「ホーム画面に追加」を実行する**:
   - 画面右上にある **「共有」ボタン（四角から上に矢印が飛び出しているアイコン）** をタップします。
   - 表示されるメニューリストの中から **「ホーム画面に追加」（Add to Home Screen）** を選択します。
   - 名前を確認（「BookReader」）し、右上の「追加」をタップします。
3. **起動確認**:
   - iPadのホーム画面に追加された「BookReader」のアイコンをタップします。
   - ブラウザのアドレスバーなどが表示されず、全画面（スタンドアロン）アプリとして起動することを確認してください。

## テスト結果記録欄

*ここにユーザーからのテスト結果を追記し、さらなる修正が必要か判断します。*
