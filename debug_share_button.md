# 読書録ボタン表示デバッグ

## 行った工程 (2026-05-12)
1. `index.html` の左サイドメニュー（`#leftMenu` の `nav.menu-nav`）に `<button id="menuShareLog">` を追加。
2. `assets/constants/ui.js` に `DOM_IDS.MENU_SHARE_LOG` を追加。
3. `assets/js/ui/elements.js` に `menuShareLog: getById(DOM_IDS.MENU_SHARE_LOG)` を追加。
4. `assets/app.js` の `setMenuLabel` で読書録ボタンにテキストとアイコンを設定する処理を追加し、クリックイベントを登録。
5. **キャッシュ対策**: ユーザーの環境で古い `index.html` や `app.js` が表示されている可能性があったため、`index.html` 内のリソース読み込みのクエリストリングを `?v=10` から `?v=11` に変更。
6. **PWAキャッシュ対策**: `assets/sw-cache-config.json` の `cacheName` を `bookreader-v10` から `bookreader-v11` に更新し、Service Worker のキャッシュ更新を促進。

## ユーザーテスト結果記録
(未テスト)
※ ハードリロード、またはPWA環境のキャッシュクリアを試してもらう予定。
