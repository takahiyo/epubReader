# 読書録ボタン表示デバッグ

## 行った工程 (2026-05-12)
1. `index.html` の左サイドメニュー（`#leftMenu` の `nav.menu-nav`）に `<button id="menuShareLog">` を追加。
2. `assets/constants/ui.js` に `DOM_IDS.MENU_SHARE_LOG` を追加。
3. `assets/js/ui/elements.js` に `menuShareLog: getById(DOM_IDS.MENU_SHARE_LOG)` を追加。
4. `assets/app.js` の `setMenuLabel` で読書録ボタンにテキストとアイコンを設定する処理を追加し、クリックイベントを登録。
5. **キャッシュ対策**: ユーザーの環境で古い `index.html` や `app.js` が表示されている可能性があったため、`index.html` 内のリソース読み込みのクエリストリングを `?v=10` から `?v=11` に変更。
6. **PWAキャッシュ対策**: `assets/sw-cache-config.json` の `cacheName` を `bookreader-v10` から `bookreader-v11` に更新し、Service Worker のキャッシュ更新を促進。
7. app.js 内で elements.menuShareLog || document.getElementById('menuShareLog') のデュアル取得に変更。リスナー登録も直接ID取得のフォールバックを追加。

## 2026-05-12 追加実装: アプリ選択 / クリップボード コピー 選択UI
- `handleShareReadingLog` を改修し、`navigator.share` が使える端末では選択ダイアログを表示するように変更
- `navigator.share` 非対応端末（PC 等）ではクリップボードコピーのみ実行
- `alert()` の代わりにトースト通知 (`showShareToast`) を実装
- `elements.menuShareLog`（サイドメニュー）にもクリックリスナーを追加
- i18n (ja/en) に選択UI用文字列を追加: `share_dialog_title`, `share_via_apps`, `share_via_clipboard`, `share_cancel`
- `sw-cache-config.json` の cacheName を `bookreader-v12` に更新

## ユーザーテスト結果記録
工程1〜5: ボタンが履いまだ出ないことを確認
工程6: 原因特定 → Service Workerキャッシュが古い elements.js を返し続け、elements.menuShareLog が nullになっている可能性。
工程7: 実装完了（テスト待ち）
