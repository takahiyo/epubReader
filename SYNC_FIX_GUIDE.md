# 🚀 同期が動作しない問題の解決手順

## 🔍 現状の問題

スクリーンショットのGAS実行ログを見ると、**まだ古いコード（修正前）が動作しています**：

```javascript
{
  hasEvent: false,
  hasPostData: false,
  hasContents: false,
  pathInfo: 'no-pathInfo'
}
```

これは **GAS側のコードが更新されていない** ことを示しています。

## ✅ 解決手順

### Step 1: GASコードを手動で更新（必須）

#### A. GitHubから最新のGASコードを取得

1. GitHub で最新の `GAS_BookReader` を開く
   - URL: https://github.com/takahiyo/epubReader/blob/genspark_ai_developer/GAS_BookReader
   
2. 「Raw」ボタンをクリックしてコード全体をコピー

#### B. Google Apps Script エディタで更新

1. **Google Apps Script エディタを開く**
   - https://script.google.com/home/projects/1ekAGjs_3ScVaoYyG9pvt5Qp1yqyvOIen-Tj

2. **Code.gs を開く**
   - 左側のファイルリストから `Code.gs` を選択

3. **全てのコードを置き換える**
   - `Ctrl+A` (全選択)
   - コピーした新しいコードを貼り付け
   - `Ctrl+S` (保存)

#### C. 新しいバージョンをデプロイ

1. **「デプロイ」→「デプロイを管理」をクリック**

2. **既存のデプロイを編集**
   - 鉛筆アイコン（✏️）をクリック

3. **「新バージョン」を選択**
   - 「バージョン」ドロップダウンから「新バージョン」を選択
   - 説明: 「Fix query parameter support」など

4. **「デプロイ」をクリック**
   - URLは変わりません

### Step 2: ブラウザでテスト

#### A. キャッシュをクリア

1. **ブラウザでブックリーダーを開く**

2. **ハードリロード（キャッシュクリア）**
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

#### B. 「今すぐ同期」ボタンを使う

1. **設定を開く**
   - 画面左上のメニューアイコン（☰）をクリック
   - または画面右上の歯車アイコンをクリック

2. **アカウントセクションを確認**
   ```
   アカウント
   [Googleログイン] [今すぐ同期]  ← 新しいボタン！
   ```

3. **Googleログインを実行**（未ログインの場合）
   - 「Googleログイン」ボタンをクリック
   - Google認証フローを完了

4. **「今すぐ同期」をクリック**
   - ボタンが「同期中...」に変わる
   - 同期ステータスが表示される：
     - ✓ 同期完了（緑色）
     - ✗ 同期に失敗しました（赤色）

### Step 3: 動作確認

#### A. 開発者ツールで確認（推奨）

1. **F12 キーを押して開発者ツールを開く**

2. **Network タブを確認**
   - Filter: `Fetch/XHR`
   - 「Preserve log」にチェック

3. **「今すぐ同期」をクリック**

4. **リクエストURLを確認**
   ```
   ✅ 正しい（修正後）:
   https://script.google.com/macros/s/{ID}/exec?path=/sync/index/pull
                                             ^^^^^^^^^^^^^^^^^^^^^^^^
                                             クエリパラメータ形式

   ❌ 間違い（修正前）:
   https://script.google.com/macros/s/{ID}/exec/sync/index/pull
                                             ^^^^^^^^^^^^^^^^^^^
                                             URLパス形式（動作しない）
   ```

5. **ステータスコードを確認**
   ```
   ✅ 200 OK  ← 成功
   ❌ 401 Unauthorized  ← GASが更新されていない
   ```

#### B. GAS実行ログを確認

1. **Google Apps Script エディタを開く**

2. **「実行」→「executions」をクリック**

3. **最新の実行を確認**
   ```
   ✅ 期待されるログ（成功）:
   {
     method: 'POST',
     hasEvent: true,        ← true になる
     hasPostData: true,     ← true になる
     hasContents: true,     ← true になる
     parameter: ['path'],   ← 'path' キーが含まれる
     pathSource: 'query-parameter',  ← クエリパラメータから取得
     path: '/sync/index/pull',
     authenticated: true,
     userKey: '...'
   }

   ❌ 現在のログ（失敗）:
   {
     hasEvent: false,
     hasPostData: false,
     hasContents: false,
     pathInfo: 'no-pathInfo'
   }
   ```

### Step 4: 進捗バーの確認（ライトモード）

1. **テーマをライトモードに変更**
   - 設定 → 表示設定 → テーマ: ライト

2. **本を開く**

3. **進捗バーを確認**
   - 画面下部に表示される青い進捗バー
   - **修正後**: 濃いグレーの背景に青い進捗バー（視認性向上）
   - シャドウ効果で立体感が追加されている

## 🎯 期待される結果

### ✅ 同期成功時

#### ブラウザ
```
設定 → アカウント
[Googleログイン] [今すぐ同期]
ユーザー名: user@example.com
✓ 同期完了  ← 緑色のメッセージ
```

#### Network タブ
```
Request URL: .../exec?path=/sync/index/pull
Request Method: POST
Status: 200 OK
Response: {"ok":true,"index":{...},"updatedAt":...}
```

#### GAS実行ログ
```
hasEvent: true
hasPostData: true
pathSource: 'query-parameter'
authenticated: true
```

### ❌ よくある問題と解決策

#### 問題1: まだ401エラーが出る

**原因**: GASコードが更新されていない

**解決策**:
1. Google Apps Script エディタで `Code.gs` を確認
2. 最新のコードに更新されているか確認
3. 特に `getPath()` 関数を確認：
   ```javascript
   function getPath(e) {
     // この行があるか確認
     if (e && e.parameter && e.parameter.path) {
       return e.parameter.path;
     }
     // ...
   }
   ```
4. 再デプロイ（新バージョン作成）

#### 問題2: 「今すぐ同期」ボタンが見つからない

**原因**: ブラウザのキャッシュが古い

**解決策**:
1. ハードリロード: `Ctrl + Shift + R`
2. または、ブラウザの設定からキャッシュを削除
3. ページを再読み込み

#### 問題3: 「Googleログインが必要です」と表示される

**原因**: 認証が完了していない

**解決策**:
1. 「Googleログイン」ボタンをクリック
2. Google認証フローを完了
3. ログイン状態が保存されるまで待つ
4. 再度「今すぐ同期」をクリック

#### 問題4: 進捗バーが見えない（ライトモード）

**原因**: ブラウザのキャッシュが古い

**解決策**:
1. ハードリロード: `Ctrl + Shift + R`
2. または、開発者ツールで `Application` → `Clear site data`
3. ページを再読み込み

## 📊 Before / After 比較

### リクエストURL

#### Before（修正前 - 動作しない）
```
https://script.google.com/macros/s/{ID}/exec/sync/index/pull
→ 401 Unauthorized
→ CORS error
```

#### After（修正後 - 動作する）
```
https://script.google.com/macros/s/{ID}/exec?path=/sync/index/pull
→ 200 OK
→ 正常に同期
```

### GAS実行ログ

#### Before（修正前）
```javascript
{
  hasEvent: false,
  hasPostData: false,
  hasContents: false,
  pathInfo: 'no-pathInfo'
}
→ 認証エラー
```

#### After（修正後）
```javascript
{
  hasEvent: true,
  hasPostData: true,
  pathSource: 'query-parameter',
  path: '/sync/index/pull',
  authenticated: true
}
→ 認証成功
```

### UI

#### Before（修正前）
```
設定 → アカウント
[Googleログイン]
ユーザー名: user@example.com

→ 手動で同期する方法がない
```

#### After（修正後）
```
設定 → アカウント
[Googleログイン] [今すぐ同期]  ← 追加！
ユーザー名: user@example.com
✓ 同期完了

→ いつでも手動で同期可能
```

## 🔧 トラブルシューティング

### デバッグコマンド（ブラウザConsoleで実行）

```javascript
// 1. 認証状態を確認
console.log('idToken:', localStorage.getItem('google_id_token') ? 'exists' : 'missing');

// 2. エンドポイントURLを確認
const settings = JSON.parse(localStorage.getItem('settings') || '{}');
console.log('GAS Endpoint:', settings.gasEndpoint);

// 3. 手動でテストリクエストを送信
const idToken = localStorage.getItem('google_id_token');
fetch(settings.gasEndpoint + '?path=/sync/index/pull', {
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

### 期待される出力

```javascript
// 成功時
idToken: exists
GAS Endpoint: https://script.google.com/macros/s/.../exec
Status: 200
Response: {ok: true, index: {...}, updatedAt: 1234567890}
```

## 📱 Android WebView での動作

### 自動同期

Googleログイン成功後、自動的に以下が実行されます：
1. Index の pull（ライブラリ同期）
2. 最後に開いた本の State pull（読書位置同期）

### 手動同期

「今すぐ同期」ボタンで、いつでも手動で同期可能：
1. 設定を開く
2. 「今すぐ同期」をクリック
3. 同期ステータスを確認

## 🎉 まとめ

この修正により：
- ✅ GASのURL形式を修正（クエリパラメータ方式）
- ✅ 「今すぐ同期」ボタンを追加（設定画面）
- ✅ 進捗バーの視認性を改善（ライトモード）
- ✅ 同期ステータスの表示を追加

**最も重要**: GASコードを手動で更新して再デプロイすること！

## 🔗 関連リソース

- **Pull Request**: https://github.com/takahiyo/epubReader/pull/120
- **最新のGASコード**: https://github.com/takahiyo/epubReader/blob/genspark_ai_developer/GAS_BookReader
- **GAS_FIX_COMPLETE.md**: 完全な修正の説明
- **GAS_DEPLOYMENT.md**: デプロイ手順の詳細

---

**次のステップ**: GASコードを更新して、「今すぐ同期」ボタンをテストしてください！
