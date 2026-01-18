# SSOT調査ログ

本ドキュメントはSSOT化の調査で使用したコマンドの記録です。

## 調査コマンド

- `rg -n "constants|config" src assets -S`
- `rg -n "getElementById|querySelector|querySelectorAll|\.classList|\"#|\"\." assets/app.js`
- `rg -n "getElementById|querySelector|querySelectorAll|classList|\"#|\"\." assets/ui.js`
- `rg -n -- "--[a-zA-Z0-9-]+" assets/style.css`
- `rg -n "assets/|\.png|\.svg|\.json|\.wasm|\.js" assets/app.js assets/ui.js assets/reader.js assets/storage.js`
