# みるみるランド AI実装ノート(docs/ai-notes.md)
### 実装AIへの規約 — 設計書v1.1の曖昧箇所の確定と追加仕様

- 版: v1.0(2026-07-22)/対象: 設計書v1.1
- **位置づけ**: 本ノートは設計書の解釈を確定させる実装規約である。設計書と本ノートが矛盾する場合、**本ノートが優先**する(該当箇所は次回の設計書改訂で本文に反映する)。
- **使い方**: 実装をAIに依頼するときは「本ノート+vt-api.md+該当アプリのspec」の3点を渡す(設計書8-8の受け渡しパッケージを3点構成に改める)。

---

## 0. 実装AIへの最重要指示(必読)

1. **外部リソースの参照を一切禁止する。** CDN・Google Fonts・外部JSライブラリ・アイコンフォント・アナリティクスを読み込んではならない。すべてのリソースはリポジトリ内の相対パスで参照する(オフライン要件・8-7)。「便利だから」とCDNのconfettiライブラリ等を足すのは本プロジェクトでは重大な規約違反である。
2. **フレームワーク・ビルド禁止。** React/Vue/npm/バンドラ/TypeScriptを使わない。素のHTML/CSS/JSのみ。
3. **ES Modulesを使わない。** `import/export`・`<script type="module">` は禁止。**classic scriptタグ+グローバル`VT`名前空間のみ**とする(理由: file://で直接開いて動作確認できることを開発要件とするため。各ファイルはIIFEで包み`'use strict'`)。
4. **vt-api.mdに存在しないVT関数を呼ばない。** 必要な機能がAPIにない場合は、app.jsに重複実装せず「vt-api.mdへの追加提案」として明示すること(coreに実装→APIリファレンス更新→app.jsから利用、の順)。
5. **`alert()`/`confirm()`/`prompt()` を使わない。** 確認ダイアログはVTの共通ダイアログ(はい/もどる の2択・大ボタン)を使う。
6. **児童生徒向け画面に失敗情報を表示しない。** ミス回数・誤答率・「ざんねん」等は、たとえ小さくても児童生徒画面には出さない。誤答データは内部記録し先生モード内でのみ表示する(原則3の厳密解釈)。

---

## 1. 画面フローとライフサイクル(vt-scene)の確定仕様

設計書7-3の3画面構成を、状態機械として次のとおり確定する。

- 状態: `title → play → result`(+モーダル的な `paused`)
- **onStart(ctx)**: playシーン開始のたびに毎回呼ぶ(「もういっかい」でも毎回。設定はその時点の保存値を再読込)。
- **onTick(ctx)**: `requestAnimationFrame` 駆動。`ctx.dt` に前フレームからの経過ms(**上限100msでクランプ**。バックグラウンド復帰時の大ジャンプ防止)を渡す。`setInterval`/`setTimeout` をゲーム進行に使わない(残り時間はdt積算で管理)。
- **onFinish(ctx)**: **正常終了時のみ**呼ぶ。戻り値のオブジェクトを記録スキーマに従って保存し、ResultScreenを表示する。
- **中断(「おわる」→はい)**: onFinishを呼ばず、**記録を保存せず**、titleへ戻る。
- **先生モードを開いたとき**: playを一時停止(タイマー停止・AudioContext suspend)。閉じたとき、**設定が1つでも変更されていたら現在のプレイを破棄してplayを最初からやり直す**(途中結果は記録しない)。無変更なら1秒の「3・2・1」表示後に再開する。※設計書7-4「即座に新設定でプレイ再開」の「再開」は**リスタート**の意である。
- **タブ非表示(visibilitychange)**: 自動でpausedにし、復帰時は「タッチしてつづける」オーバーレイを出す。
- **各アプリのindex.htmlは_templateの雛形を変更しない。** 中身は `<div id="stage"></div>` とcore/app読込のscriptタグのみ。画面(タイトル・結果・パネル)はすべてVTがstage内に生成する。app.jsが独自に画面骨格を作ってはならない。

## 2. 座標系・レイアウトの確定仕様

- **ステージ=ビューポート全面**(`position:fixed; inset:0`)。高さは `100dvh`(フォールバック `100vh`)。iOS Safariのツールバー分のズレ対策としてリサイズ時に再計測する。
- **設計書のpx値はCSS pxの絶対値**であり、画面サイズに応じてスケールしない(72px最小は小さいiPadでも72pxのまま)。刺激の**配置**のみステージ実寸(`getBoundingClientRect`)から毎回計算する。固定論理解像度(1024×768等)へのハードコード禁止。
- **出現位置の規則**: 対象はステージ端から**24px以上**内側かつ対象自身が完全に収まる範囲に出現させる。連続出現時は**直前の位置から対象1個分以上**離す(同じ場所に連続して出さない)。「出現範囲」設定(中央/左半分等)はこの規則の適用後に領域を制限する。
- 乱数は `Math.random()` でよい(再現性が必要なアプリはspecに明記された場合のみシード付きRNGを使う)。

## 3. 設定スキーマの確定仕様(設計書8-3を改める)

**choice型のoptionsは文字列配列ではなく `{value, label}` の配列とする。** 保存・digest・分岐には**ASCIIのvalue**を使い、labelは表示専用とする(v1.1の例のように日本語ラベルを保存値に使うと、文言修正が過去記録のdigestを壊すため)。

```javascript
settings: {
  size: { type: "choice", label: "大きさ", default: "xl",
          options: [ {value:"xl",label:"特大"}, {value:"l",label:"大"},
                     {value:"m",label:"中"},  {value:"s",label:"小"} ] },
  count:    { type: "range",  label: "同時に出る数", min:1, max:3, step:1, default:1 },
  sound:    { type: "toggle", label: "音", default:true, difficulty:false },
  theme:    { type: "choice", label: "絵柄", default:"animals", difficulty:false, options:[...] }
}
```

- 許可される型は `choice / range / toggle` の3種のみ。新しい型が必要な場合はvt-settingsを拡張しvt-api.mdに追記してから使う。
- **digestの定義**: `difficulty:false` が付いた項目(音・絵柄テーマ等の難易度に無関係な設定)を除く全設定のvalueを、スキーマ定義順に `/` で連結した文字列とする(既定は `difficulty:true` 扱い)。例: `"xl/full/1/60s"`。
- 保存値は読込時に必ずスキーマで検証する(未知のchoice値→default、range→min/maxにクランプ、未知キー→無視)。

## 4. 設定コード(SettingsCode)のフォーマット確定

- URL形式: `...?s=<base64url(JSON文字列)>`
- JSON: `{ "v": 1, "id": "c01-target-touch", "set": { <設定キー: value> } }`
- 適用条件: `id` が現在のアプリと一致する場合のみ。`set` は§3の検証を通してから適用・保存する(検証済みの値以外を書き込まない)。不一致・破損時は無言で無視して通常起動。
- エンコードは `encodeURIComponent` を挟んだUTF-8→base64url。日本語を含まない(§3のASCII value)ためURL長は問題にならない。

## 5. 入力(vt-input)の確定仕様

- **Pointer Eventsで実装**する(touchstart/mousedown併用の二重発火実装を書かない)。指の識別は `pointerId` で追跡し、常時マルチタッチ前提(7-4)。
- stageに `touch-action: none`、全体に `-webkit-tap-highlight-color: transparent`・`user-select: none` を適用。`contextmenu` と `gesturestart` はpreventDefault(長押しメニュー・ピンチ拡大の抑止)。viewport metaは `width=device-width, initial-scale=1, viewport-fit=cover`。
- ゲームプレイの判定に `click` イベントを使わない(`pointerdown` 基準。反応時間測定の要件)。先生パネル内のフォームは通常のclickでよい。
- 長押し判定(先生モード): 3000ms、移動許容10px。
- デバウンス: **同一ターゲットに対する** 300ms以内の再タッチのみ無効。別ターゲット・別pointerIdは妨げない。

## 6. 音(vt-feedback)の確定仕様

- `AudioContext` は**アプリ全体で1個**。**最初のユーザー操作(スタートボタンのpointerdown)で生成/resume**する(iOSの自動再生制限のため、ページ読込時に生成しない)。設定 `sound:false` の間は生成もしない。
- 合成音はすべて**400ms以下**の短音。マスターGainの既定値0.3。ネガティブな下降ブザー音を作らない(原則3)。一時停止時は `suspend()`。

## 7. 表記・データの確定仕様

- **児童生徒向けテキストはひらがな+分かち書き**(例: 「きろくを みる」「もう いっかい」)。数字は半角。先生パネル内は漢字かなまじりでよい。
- 日付は端末ローカル時刻の `YYYY-MM-DD` 文字列。
- LocalStorageの読み出しは必ずtry/catch+JSON検証し、破損時は既定値で初期化する(エラー画面を出さない)。
- 「同日内」判定(8-4の前回比条件)は上記日付文字列の一致で行う。

## 8. その他、AIが誤解しやすい点の明示

- **OrientationGuard**: `matchMedia("(orientation: portrait)")` の変更イベント+resizeで検知する。`window.orientation` は使わない(非推奨)。表示中はplayを自動pause。
- **F-01の時刻**: `PointerEvent.timeStamp` を使用(performance.now()と同一時間軸)。`Date.now()` で測らない。
- **「どこを触ってもよい」(F-01)** はstage全面が単一ターゲットという意味であり、デバウンス規則(§5)は通常どおり適用する。
- **絵文字を機能表示に使わない**(端末・OS差で描画が変わるため)。演出・アイコンはすべて自作SVG。
- specに書かれていない機能を「気を利かせて」追加しない。追加したい改善は実装せず提案として報告する。

## 9. 受け入れ条件(全アプリ共通DoD。各specの個別DoDに加えて必ず満たす)

1. リポジトリ外への通信が一切発生しない(DevToolsのNetworkで確認)。
2. index.htmlをfile://で直接開いても動作する。
3. 縦持ちでOrientationGuardが表示され、横に戻すと復帰する。
4. 音OFF設定で全課題が成立し、AudioContextが生成されない。
5. 先生モードで設定変更→閉じるとプレイが最初からやり直しになり、変更が反映・保存されている。
6. 中断終了(「おわる」)では記録が保存されない。
7. 児童生徒向け画面のどこにもミス数・誤答率・ネガティブ表現が表示されない。
8. `?s=` 設定コード付きURLで開くと設定が適用・保存される(不正なコードでは無視して通常起動)。
