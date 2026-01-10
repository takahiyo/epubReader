# GAS トラブルシューティング：GET vs POST 問題

## 🔍 発見された問題

スクリーンショットとログから以下が判明しました：

### 1. デプロイ設定は正しい ✅
- 種類: ウェブアプリ
- 実行ユーザー: 自分（taka.hiyo@gmail.com）
- アクセスできるユーザー: 全員
- URL: `https://script.google.com/macros/s/.../exec`

### 2. エンドポイント設定も正しい ✅
config.js に正しいGAS_SYNC_ENDPOINTが設定されています

### 3. **根本原因: GETリクエストが送られている** ❌

GAS実行ログを見ると：
```javascript
{
  hasEvent: false,      // ← イベントオブジェクトなし
  hasPostData: false,   // ← POSTデータなし
  hasContents: false,   // ← コンテンツなし
  pathInfo: 'no-pathInfo'
}
```

これは `doGet()` が呼ばれている証拠です。

しかし、ブラウザからは `doGet()` のレスポンスが返っています：
```json
{"ok":true,"timestamp":...,"message":"GAS BookReader Sync API","version":"2.0","path":""}
```

## 🚨 問題の詳細

### POSTリクエストが期待されるのにGETになっている

**理由の候補**:

1. **ブラウザのプリフライト後のフォールバック**
   - CORSプリフライト（OPTIONS）の後、GETにフォールバックしている

2. **リダイレクトによるメソッド変更**
   - 302/307リダイレクトでPOST→GETに変わることがある
   - GASのURL処理の問題

3. **fetch() の body が送信されていない**
   - 何らかの理由でbodyが削除され、GETとして扱われる

## 🔧 実施した対策

### 1. doOptions() 関数を追加

CORS プリフライトリクエスト（OPTIONS）に対応：

```javascript
function doOptions(e) {
  console.log({
    method: 'OPTIONS',
    timestamp: new Date().toISOString(),
    note: 'CORS preflight request'
  });
  
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

### 2. doGet() のログを改善

GETリクエストが来た場合に警告を表示：

```javascript
function doGet(e) {
  console.log({
    method: 'GET',
    path: path,
    warning: 'GET request received - expecting POST for sync operations'
  });
  
  return jsonResponse({ 
    ok: true,
    note: "Use POST requests for sync operations"
  });
}
```

### 3. doPost() のログを強化

```javascript
console.log({
  method: 'POST',
  parameter: e && e.parameter ? Object.keys(e.parameter) : 'no-parameter',
  parameters: e && e.parameters ? Object.keys(e.parameters) : 'no-parameters',
  // ... 他のフィールド
});
```

## 📋 次のステップ（必須）

### Step 1: 更新したGASコードをデプロイ

1. Google Apps Scriptエディタで `GAS_BookReader` を更新
2. 「デプロイ」→「デプロイを管理」
3. 既存のデプロイの鉛筆アイコンをクリック
4. 「バージョン」→「新バージョン」を選択
5. 「デプロイ」をクリック

### Step 2: ブラウザの Network タブで確認（最重要）

**この確認が問題解決の鍵です！**

1. ブラウザで開発者ツール（F12）を開く
2. **Network タブ**を選択
3. **「Preserve log」にチェック**を入れる
4. **Filter を「Fetch/XHR」に設定**
5. ブックリーダーで「今すぐ同期」をクリック
6. `script.google.com/macros/s/.../exec` へのリクエストを探す

### Step 3: リクエスト詳細を確認

クリックして詳細を表示し、以下をスクリーンショット：

#### Headers タブ
```
Request URL: https://script.google.com/macros/s/.../exec/sync/index/pull
Request Method: POST ← これが GET になっていないか確認！
Status Code: 200 ← 302, 307, 401 ではないか
```

```
Request Headers:
Content-Type: text/plain;charset=utf-8
```

#### Payload タブ
```
{"idToken":"eyJhbG..."}
```
↑ これが空でないか確認

#### Preview/Response タブ
エラーメッセージやリダイレクト情報がないか確認

### Step 4: GAS実行ログを再確認

新しいログで以下を確認：

#### ケースA: OPTIONS リクエストが来た場合
```javascript
{
  method: 'OPTIONS',
  note: 'CORS preflight request'
}
```
→ ブラウザがプリフライトを送っている証拠

#### ケースB: GET リクエストが来た場合
```javascript
{
  method: 'GET',
  warning: 'GET request received - expecting POST'
}
```
→ POSTがGETに変わっている証拠

#### ケースC: POST リクエストが正しく来た場合（期待）
```javascript
{
  method: 'POST',
  hasEvent: true,        // ← true になる
  hasPostData: true,     // ← true になる
  hasContents: true,     // ← true になる
  contentsLength: 800+,  // ← 実際の長さ
  contentsPreview: '{"idToken":"eyJ...'
}
```
→ 正常動作！

## 🔍 診断フローチャート

```
ブラウザから同期実行
    ↓
[Network タブで確認]
    ↓
Request Method は POST?
├─ No (GET) ──→ なぜGETになったか調査
│              ├─ リダイレクト (302/307)?
│              ├─ CORS エラー?
│              └─ fetch() の問題?
└─ Yes
    ↓
Request Payload に idToken が含まれる?
├─ No ──→ フロントエンド側の問題
│         ├─ getIdToken() が null?
│         └─ Googleログインしていない?
└─ Yes
    ↓
Status Code は 200?
├─ No ──→ ステータスコードを確認
│         ├─ 302/307: リダイレクト問題
│         ├─ 401: 認証問題
│         └─ 403: 権限問題
└─ Yes
    ↓
Response は正しいJSON?
├─ No ──→ GAS実行ログを確認
└─ Yes ──→ [成功！]
```

## 🎯 特に確認すべきポイント

### 1. Request Method が POST か確認

**期待**: `Request Method: POST`  
**実際**: もし `GET` なら、これが問題の根本原因

### 2. リダイレクトの有無

Network タブで複数のリクエストが表示される場合：
- 最初のリクエストが302/307でリダイレクト
- 2番目のリクエストがGETに変わっている可能性

### 3. CORS エラーの有無

Console タブで以下のエラーがないか確認：
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

### 4. Request Payload の内容

Payload タブで `{"idToken":"..."}` が表示されるか確認  
もし空なら、フロントエンド側の問題

## 📊 予想される結果

### シナリオA: POSTがGETに変わっている

**Network タブ**:
```
Request Method: GET  ← 問題！
```

**原因**: リダイレクトまたはCORS対応の問題

**解決策**:
1. GASのURLに余計なパラメータがついていないか確認
2. doOptions() が正しく動作しているか確認
3. ブラウザのCORS拡張機能を無効化してテスト

### シナリオB: POSTだがbodyが空

**Network タブ**:
```
Request Method: POST  ← OK
Payload: (empty)  ← 問題！
```

**原因**: getIdToken() が null を返している

**解決策**:
1. Consoleで `localStorage.getItem('google_id_token')` を確認
2. Googleログインを再実行
3. auth.js の getIdToken() を確認

### シナリオC: 正常動作（期待）

**Network タブ**:
```
Request Method: POST  ← OK
Payload: {"idToken":"eyJhbG..."}  ← OK
Status: 200  ← OK
```

**GAS実行ログ**:
```javascript
{
  method: 'POST',
  hasContents: true,
  contentsLength: 856,
  contentsPreview: '{"idToken":"eyJ...'
}
```

→ 認証成功！

## 📸 次回報告時に必要なスクリーンショット

以下を撮影してください：

1. **Network タブ - Headers**
   - Request URL
   - Request Method
   - Status Code
   - Request Headers

2. **Network タブ - Payload**
   - Request Payload の内容全体

3. **Network タブ - Response**
   - Response の内容

4. **Console タブ**
   - エラーメッセージの有無

5. **GAS実行ログ**
   - 最新の実行の全ログ

## 🔗 関連リソース

- Pull Request: https://github.com/takahiyo/epubReader/pull/120
- GAS_DEBUG_GUIDE.md: 基本的なデバッグ手順
- GAS_DEPLOYMENT.md: デプロイメント手順

## 💡 ヒント

### 簡易テスト（ブラウザConsoleで実行）

```javascript
// GAS エンドポイントを確認
const settings = JSON.parse(localStorage.getItem('settings') || '{}');
console.log('Endpoint:', settings.gasEndpoint);

// idToken を確認
const idToken = localStorage.getItem('google_id_token');
console.log('Has idToken:', !!idToken);
console.log('Token length:', idToken ? idToken.length : 0);

// 手動でPOSTリクエストをテスト
fetch(settings.gasEndpoint + '/sync/index/pull', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ idToken })
})
.then(r => {
  console.log('Status:', r.status);
  return r.json();
})
.then(data => console.log('Response:', data))
.catch(err => console.error('Error:', err));
```

このテストで：
- Status が 200 なら通信は成功
- Response に認証エラーがあれば idToken の問題
- Network エラーなら CORS の問題

---

これで問題の特定と解決が可能です！
Network タブのスクリーンショットが最も重要な情報となります。
