# GAS デバッグ手順（空payloadエラー対応）

## 🔍 現在の状況

スクリーンショットで確認されたエラー：
```
2:23:10 エラー  { authError: 'No idToken provided' }
2:23:10 エラー  { error: '認証エラー: idToken が必要です',
                 stack: 'Error: 認証エラー: idToken が必要です\n  at verifyIdToken (コード:112:11)\n  at doPost (コード:37:18)',
                 timestamp: '2026-01-10T17:23:10.604Z' }
```

実行ログの詳細：
```
{ timestamp: '2026-01-10T17:23:10.607Z',
  path: '',              ← pathが空
  hasPayload: true,
  hasToken: false,       ← idTokenがfalse
  payloadKeys: [] }      ← payloadのキーが空配列
```

## 問題の原因候補

1. **フロントエンドがidTokenを送っていない**
   - `getIdToken()` が空を返している
   - ユーザーがGoogleログインしていない
   - トークンが期限切れ

2. **リクエストフォーマットの不一致**
   - `Content-Type: text/plain` で送っているが、GASが正しくパースできていない
   - JSONが壊れている
   - エンコーディングの問題

3. **pathInfo が空**
   - エンドポイントURLが正しくない
   - `/exec` 以降にパスが含まれていない

## 🔧 実施した対策

### GAS_BookReader の改善

**詳細なリクエストログを追加：**
```javascript
// doPost() の冒頭に追加
console.log({
  timestamp: new Date().toISOString(),
  hasEvent: !!e,
  hasPostData: !!(e && e.postData),
  hasContents: !!(e && e.postData && e.postData.contents),
  contentType: e && e.postData ? e.postData.type : 'no-postData',
  contentsLength: e && e.postData && e.postData.contents ? e.postData.contents.length : 0,
  contentsPreview: e && e.postData && e.postData.contents ? e.postData.contents.substring(0, 200) : 'no-contents',
  pathInfo: e && e.pathInfo ? e.pathInfo : 'no-pathInfo',
});
```

**parsePayload() の強化：**
```javascript
function parsePayload(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      console.log({ parsePayloadError: 'Missing e or postData or contents' });
      return {};
    }
    
    const contents = e.postData.contents;
    console.log({ 
      parsingContents: true,
      contentsType: typeof contents,
      contentsLength: contents ? contents.length : 0,
      firstChars: contents ? contents.substring(0, 100) : 'empty'
    });
    
    const parsed = JSON.parse(contents);
    console.log({
      parsedSuccessfully: true,
      parsedKeys: Object.keys(parsed),
      hasIdToken: !!parsed.idToken,
      idTokenLength: parsed.idToken ? parsed.idToken.length : 0,
    });
    
    return parsed;
  } catch (error) {
    console.error({ 
      parsePayloadException: error.message,
      stack: error.stack,
      rawContents: e && e.postData ? e.postData.contents : 'no-contents'
    });
    return {};
  }
}
```

## 📋 次のステップ

### 1. 更新したGASコードをデプロイ

1. Google Apps Scriptエディタで `GAS_BookReader` の内容を更新
2. 「デプロイ」→「デプロイを管理」をクリック
3. 既存のデプロイの鉛筆アイコンをクリック
4. 「バージョン」→「新バージョン」を選択
5. 「デプロイ」をクリック

### 2. テストリクエストを実行

ブックリーダーから以下のいずれかの操作を実行：
- 「設定」→「今すぐ同期」をクリック
- 本を開いて自動同期を待つ
- Android WebViewでログイン

### 3. 実行ログを確認

Google Apps Scriptエディタで：
1. 「実行」→「executions」を開く
2. 最新の実行を選択
3. 以下のログを確認：

#### 期待されるログ（正常時）:
```javascript
// 1. リクエスト構造ログ
{
  timestamp: "2026-01-10T...",
  hasEvent: true,
  hasPostData: true,
  hasContents: true,
  contentType: "text/plain",
  contentsLength: 1234,              // ← 0以外
  contentsPreview: '{"idToken":"eyJ...', // ← JSONが見える
  pathInfo: "/sync/index/pull"       // ← パスが正しい
}

// 2. パース処理ログ
{
  parsingContents: true,
  contentsType: "string",
  contentsLength: 1234,
  firstChars: '{"idToken":"eyJhb...'
}

// 3. パース成功ログ
{
  parsedSuccessfully: true,
  parsedKeys: ["idToken"],          // ← idTokenが含まれる
  hasIdToken: true,                 // ← true
  idTokenLength: 856                // ← 長さが0以外
}

// 4. 認証成功ログ
{
  authenticated: true,
  userKey: "123456789012345678901",
  email: "user@example.com"
}
```

#### 異常時の診断:

**ケース1: contentsLength が 0**
```javascript
{
  contentsLength: 0,
  contentsPreview: 'no-contents'
}
```
→ **原因**: フロントエンドがbodyを送っていない  
→ **対策**: cloudSync.js の postGas() を確認

**ケース2: contentsPreview が空オブジェクト**
```javascript
{
  contentsLength: 2,
  contentsPreview: '{}'
}
```
→ **原因**: 空のJSONが送られている（idTokenが含まれていない）  
→ **対策**: getIdToken() が正しく動作しているか確認

**ケース3: pathInfo が空**
```javascript
{
  pathInfo: 'no-pathInfo'
}
```
→ **原因**: エンドポイントURLにパスが含まれていない  
→ **対策**: 
- GASエンドポイント設定を確認
- 正しい形式: `https://script.google.com/macros/s/.../exec/sync/index/pull`
- フロントエンドが正しくパスを付けているか確認

**ケース4: JSON.parseエラー**
```javascript
{
  parsePayloadException: "Unexpected token...",
  rawContents: "..."
}
```
→ **原因**: JSONが壊れている  
→ **対策**: contentsの内容を確認し、JSONとして妥当か検証

### 4. フロントエンド側の確認

ブラウザの開発者ツール（F12）で：

#### Console タブ
```javascript
// Googleログイン状態を確認
console.log('idToken:', localStorage.getItem('google_id_token'));

// CloudSyncのテスト
import('./assets/cloudSync.js').then(m => {
  const sync = new m.CloudSync(storage);
  sync.pullIndex().then(console.log).catch(console.error);
});
```

#### Network タブ
1. `script.google.com/macros/s/.../exec` へのPOSTリクエストを探す
2. リクエスト詳細を確認：
   - **Headers**: `Content-Type: text/plain;charset=utf-8`
   - **Request Payload**: `{"idToken":"eyJ..."}`（idTokenが含まれているか）
   - **Response**: ステータスコードとレスポンスボディ

### 5. よくある問題と解決策

#### 問題A: idToken が null
```javascript
// auth.js で確認
export function getIdToken() {
  return localStorage.getItem('google_id_token');
}
```
**解決**: 
1. 設定画面で「Googleログイン」をクリック
2. ログインフローを完了
3. localStorage に `google_id_token` が保存されることを確認

#### 問題B: エンドポイントURLが間違っている
**間違い**: `https://script.google.com/macros/s/.../exec`  
**正しい**: フロントエンドが自動でパスを追加するので、この形式で正しい

#### 問題C: CORS エラー
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```
**解決**: 
1. GASデプロイ設定を確認
2. 「アクセスできるユーザー」が「全員」になっているか確認
3. 再デプロイが必要な場合は新バージョンを作成

## 📊 デバッグフローチャート

```
リクエスト送信
    ↓
[GAS実行ログ確認]
    ↓
contentsLength > 0 ? ─── No ───→ フロントエンド側のpostGas()を確認
    ↓ Yes
pathInfo が正しい? ─── No ───→ エンドポイントURL設定を確認
    ↓ Yes
parsedSuccessfully? ─── No ───→ JSON形式を確認、rawContentsを検証
    ↓ Yes
hasIdToken: true? ─── No ───→ getIdToken()を確認、Googleログインを実行
    ↓ Yes
[認証成功]
```

## 🎯 次回報告時に必要な情報

実行ログのスクリーンショットを共有する際は、以下を含めてください：

1. **Raw Request Log** (最初のconsole.log):
   - hasEvent, hasPostData, hasContents の値
   - contentType と contentsLength
   - contentsPreview の最初の数文字
   - pathInfo の値

2. **Parse Process Log**:
   - parsingContents の有無
   - parsedSuccessfully の値
   - parsedKeys の内容

3. **Error Log**（エラーが発生した場合）:
   - エラーメッセージ全文
   - parsePayloadException の有無

これにより、問題の根本原因を迅速に特定できます。

## 📚 関連ドキュメント

- **GAS_DEPLOYMENT.md**: 完全なデプロイメント手順
- **Pull Request**: https://github.com/takahiyo/epubReader/pull/119
- **デバッグコミット**: 詳細なログ追加の変更内容
