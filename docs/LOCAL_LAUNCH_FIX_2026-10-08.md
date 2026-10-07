# file://起動時にメニューが動かない問題（Ver1.2.5）

利用者の確認URLは `file:///E:/Local_Storage/GitHub/epubReader/index.html`。Chromeで再現すると、ES Modulesの読み込みがCORS制限で拒否され、app.jsのイベント初期化が実行されなかった。タイトルと静的HTMLだけが表示される状態は、新しい目録の保存処理の失敗ではなかった。

Windows向けのStart-BookReader.cmdと、追加パッケージを必要としないNode.jsのローカルHTTPプレビューを追加した。サーバー準備後にブラウザーを開く。標準URLは http://127.0.0.1:8000/ 。同じオリジンでの利用を続ける。file://とHTTP、異なるホスト名・ポート・ブラウザーの保存領域は別であり、データ消去による対処は行わない。

直接HTMLを開いた場合は、モジュールに依存しないclassic scriptがHTTP起動方法を表示する。既存の書籍・目録・進捗を変更しない。プレビューはloopbackのみで待ち受け、公開アプリファイルだけを返す。NodeテストでMIME、キャッシュ無効化、ソースモジュールの配信、リポジトリの非公開ファイルの拒否を確認する。

あわせて、index.htmlはCSSを個別に読み込む構成のため、統合目録の24-catalog.cssを明示的に追加した。前段階の単独UI試験はstyle.cssの全importを使っており、実HTMLでのCSS読み込み不足を検出できていなかった。

tests/local-launch-browser.mjsは、実際のfile://読み込み拒否と案内表示、およびHTTPでの起動・設定メニュー・統合目録のflexレイアウトを確認する。Firebase/CDNを置き換えないChrome検証が通過した。実行はBROWSER_EXECUTABLEを必要に応じて指定して `node tests/local-launch-browser.mjs`。
