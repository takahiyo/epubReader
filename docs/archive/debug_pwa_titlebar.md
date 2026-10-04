# PWA タイトルバー非表示化のデバッグ記録

## 現状の確認 (2026-04-24)
- `manifest.json` の `display` は既に `"standalone"` に設定されている。
- `display_override` に `"window-controls-overlay"` が指定されており、これが優先されている可能性がある。
- Android等で「URLや共有ボタンが表示される」のは、`minimal-ui` や `browser` モードのように見える挙動。

## 実施工程
1. `display_override` を削除し、純粋な `"standalone"` 設定に変更した。 (2026-04-24)

## テスト結果
- (ユーザーによるデプロイ・再インストール後の報告待ち)
