# EPUB読込のローディング空白問題 - 調査記録

## 症状
- ローディングアニメーション: ~3-5秒
- 空白画面: 10-40秒
- テキスト表示
- 最大化リサイズ: 50秒、ローディングなし

## 対処1: hideLoadingをrAFで遅延 (commit 493836d)
**変更**: `finally { requestAnimationFrame(() => hideLoading()) }`
**結果**: 効果なし。rAFが`applyReadingSettings`内の`showLoading()`と競合

## 対処2: hideLoadingをtry/catchに変更 (commit 802e62e)
**変更**: openEpub成功時はhideLoadingを呼ばず、line 907のhideLoadingに統合
**結果**: 効果なし。空白は依然10秒以上

## 対処3: 不要な再パジネーション防止 + コールバック (commit 0a1777e)
**変更**:
- `applyReadingState`で自動検出結果をfallbackに使用
- `handleResize`にonRepaginationStart/Endコールバック追加
- `locations.generate`を1秒遅延
**結果**: ローディング5秒→空白40秒。最大化で50秒ローディングなし

### 判明した問題
1. `onRepaginationStart`/`onRepaginationEnd`がコンストラクタで受け取られていなかった → 修正済み
2. `hideLoading`が想定外に早く呼ばれる → **調査中**

## 対処4: コンストラクタ修正 + 診断ログ強化 (実装中)
**変更**:
- ReaderControllerコンストラクタにonRepaginationStart/End追加
- `hideLoading()`に`console.trace()`追加 → どこから呼ばれているか特定
- `buildPagination`にtiming log追加
- SWキャッシュv6→v7バンプ

### 確認依頼
デプロイ後、Consoleで以下を確認:
1. `[hideLoading] called` のスタックトレース → **最初に呼ばれた箇所**が根本原因
2. `[buildPagination] total` → パジネーション所要時間
3. `[handleFile] openEpub` → openEpub所要時間
4. `[handleFile] applyReadingState` → applyReadingState所要時間
5. `[applyReadingDirection]` → スキップされたか、再パジネーションが実行されたか
