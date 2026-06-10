# Quest 3 ファイル受け渡しエラーのデバッグ記録

## 調査の目的
Quest 3環境にて、サードパーティーのファイラーからPWA（BookReader）へファイルを渡す処理がうまくいかない原因を精査し、その解決策を探る。

## 行った工程
1. **リポジトリの最新化**
   - `Dev` ブランチをリモートからチェックアウトし、最新のコードをPullしました。
2. **関連ファイルのコード精査**
   - Web Share Targetの実装: `manifest.json`, `sw.js`, `assets/app.js`
   - Drag & Dropの実装: `assets/app.js` の `dragover` および `drop` イベント

## 精査結果と原因の考察

### 1. Web Share Target (共有メニューからのPush) が失敗する原因
実装自体は `manifest.json` と `sw.js` に組み込まれており、Service Worker がファイルを `postMessage` で `app.js` に転送するロジック（`share-target-file` イベント）が存在します。
しかし、以下の**タイミング問題（Race Condition）**が発生している可能性が極めて高いです。

- **問題のメカニズム:**
  Questのファイラーから「共有」をトリガーしてPWAが起動する際、`sw.js` は即座に `postMessage` を発行してファイルをクライアントへ送ろうとします。しかし、この時点ではまだPWA側のDOMや `app.js` が完全に読み込まれておらず、`app.js` 側での `navigator.serviceWorker.addEventListener('message', ...)` のリスナー登録が間に合っていません。
  結果として、メッセージが「空振り」し、ブラウザ側でファイルが受け取れない状態になっています。

- **解決策:**
  提案テキストにもある通り、**IndexedDB を経由してファイルを保存する**アプローチが最も確実です。
  1. `sw.js` は受け取ったファイルを IndexedDB の特定のストアに保存する。
  2. メイン画面へリダイレクト（`Response.redirect('./', 303)`）。
  3. `app.js` の初期化時（`DOMContentLoaded` または `init` 内）に IndexedDB を確認し、共有されたファイルがあればそれを読み込んでリーダーに渡し、IndexedDB から削除する。

### 2. Drag & Drop が失敗する原因
`app.js` の3769行目付近で `window.addEventListener('drop', ...)` が設定されていますが、Quest 3のマルチウィンドウ環境下では以下の問題が考えられます。

- **問題のメカニズム:**
  - `window` オブジェクトに対するドロップ判定は、モバイル環境や特殊なウィンドウマネージャー（Quest Horizon OS）では、OSのクリップボード・ドラッグインテントと正しく連携せず、ブラウザへの「一時的なファイルアクセス権限」の譲渡がキャンセルされる場合があります。
  - OSがドロップ先として明確な「Drop Target（DOM要素）」を求めている可能性があります。

- **解決策:**
  UI上に明確な「ドロップエリア（例: ライブラリの空きスペースや、ファイル読み込みの特定の四角いエリア）」のDOM要素を設け、その要素に対して `dragover` や `drop` のイベントリスナーを付与することで、OS側に「確実にPWAが受け入れる準備ができている」と認識させ、アクセス権限のエラーを回避できる可能性が高まります。

## 検証手順（PCブラウザでのシミュレート）

Quest 3実機がなくても、以下の手順でPCブラウザ（Chrome/Edge）のデベロッパーツールを用いて動作テストが可能です。

### 1. IndexedDB経由での自動読み込みテスト
このテストでは、「`sw.js` がファイルを受け取ってIndexedDBに保存した状態」を擬似的に作り出し、ページリロード後に `app.js` が正しく自動で本を開くか確認します。

1. PWAのローカルサーバーを起動し、ブラウザで開きます。
2. F12キーでデベロッパーツールを開き、「Console（コンソール）」タブに移動します。
3. 以下のダミーファイル作成＆保存スクリプトをコンソールに貼り付けて実行します。

```javascript
(async function simulateShareTarget() {
  // テスト用のテキストファイル（EPUBの代わり）を作成
  const dummyFile = new File(["Hello, this is a shared file test."], "test-share.txt", { type: "text/plain" });

  await new Promise((resolve, reject) => {
    const request = indexedDB.open('ShareTargetDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shared_files')) {
        db.createObjectStore('shared_files');
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('shared_files', 'readwrite');
      const store = tx.objectStore('shared_files');
      store.put(dummyFile, 'shared_book');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
  console.log("✅ ダミーファイルをIndexedDBに保存しました。ページをリロードしてください。");
})();
```

4. コンソールに完了メッセージが出たら、**ページをリロード（F5）**します。
5. ページ起動後、自動的に「test-share.txt」の内容（リーダー画面）が開けばテスト成功です。

### 2. Service Worker のエラーチェック
1. デベロッパーツールの「Application（アプリケーション）」タブを開きます。
2. 左メニューから「Service Workers」を選択します。
3. 現在の `sw.js` がエラーなく `Activated and is running` と表示されていることを確認します（もし赤いエラーが出ていれば、構文エラーなどが起きています）。
4. （任意）オフラインモードにチェックを入れ、リロードしてPWA自体がキャッシュで正常起動するか確認します。
