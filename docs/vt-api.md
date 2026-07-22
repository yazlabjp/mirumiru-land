# vt-api.md — VT core v1 APIリファレンス

- 版: v1.0(2026-07-22)/対象: core/v1
- ステータス: **規範仕様**(Phase 0の実装は本書に合わせて行う。実装中に変更が必要になった場合は、コードより先に本書を更新する)
- 更新規律: core変更と**同一コミット**で本書を更新する(設計書8-5)。v1へは**関数の追加のみ可・既存挙動の変更は不可**。
- 優先順位: APIの署名・型・検証規則について、**本書 > ai-notes.md > 設計書**とする(ai-notes.md §3〜§6の確定事項は本書に統合済み。矛盾時は本書が正)。
- 実装AIへ: **本書に存在しない `VT.*` を呼ばないこと。** 必要な機能が無い場合は「本書への追加提案」として報告し、app.jsに重複実装しない。

---

## 0. 前提と読み込み

classic scriptのみ(ES Modules禁止・ai-notes §0)。各ファイルはIIFE+`'use strict'`で、グローバルには `VT` の1名前空間だけを公開する。各アプリのindex.html(_template由来・変更禁止)は次の順で読み込む。

```html
<link rel="stylesheet" href="../../core/v1/css/base.css">
<link rel="stylesheet" href="../../core/v1/css/components.css">
<link rel="stylesheet" href="../../core/v1/css/themes.css">
<script src="../../core/v1/js/vt-core.js"></script>   <!-- 名前空間・VT.Rand・共通ユーティリティ -->
<script src="../../core/v1/js/vt-input.js"></script>
<script src="../../core/v1/js/vt-storage.js"></script>
<script src="../../core/v1/js/vt-settings.js"></script>
<script src="../../core/v1/js/vt-feedback.js"></script>
<script src="../../core/v1/js/vt-stim.js"></script>
<script src="../../core/v1/js/vt-motion.js"></script>
<script src="../../core/v1/js/vt-chart.js"></script>
<script src="../../core/v1/js/vt-scene.js"></script>  <!-- 最後(他モジュールに依存) -->
<script src="app.js"></script>
```

**型表記の凡例**: TypeScript風に書くが実装はプレーンJS。`?` は省略可。座標・寸法はすべてステージ左上原点のCSS px。

---

## 1. VT.createApp(def) — アプリの唯一のエントリポイント

app.jsは `VT.createApp(def)` を1回だけ呼ぶ。画面フロー(title/play/result)・先生モード・OrientationGuard・記録保存・結果画面はcoreが自動で行う。

### 1-1. def のフィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| meta | `{ id: string, title: string }` | ✔ | idはアプリフォルダ名と完全一致(例 `"c01-target-touch"`)。apps.jsonのidとの一致はチェックリスト対象 |
| settings | `SettingsSchema`(§2) | ✔ | 先生パネルはここから自動生成される |
| record | `RecordSchema`(§3) | ✔ | 記録の保存・前回比・グラフの定義 |
| stageTouch | `boolean = false` |  | trueにするとターゲット外(ステージ全面)のタップでも `onTouch(ctx, null)` が呼ばれる(F-01のような全画面ボタン用) |
| onStart | `(ctx) => void` | ✔ | playシーン開始のたびに毎回呼ばれる(「もういっかい」含む)。刺激の初期配置を行う |
| onTick | `(ctx) => void` |  | 毎フレーム(rAF駆動)。`ctx.dt` を使う。静的な課題では省略可 |
| onTouch | `(ctx, target) => void` |  | `ctx.addTarget()` 済み要素へのタップ時に呼ばれる(§4-2) |
| onFinish | `(ctx) => object` | ✔ | **正常終了時のみ**呼ばれる。recordスキーマのkeyを持つオブジェクトを返す。coreが保存と結果画面表示を行う |
| onAbort | `(ctx) => void` |  | 中断終了(「おわる」→はい)時の後始末。**記録は保存されない** |

### 1-2. ライフサイクル規則(規範)

- 進行は `requestAnimationFrame` 駆動。`ctx.dt` は前フレームからの経過ms(**上限100msでクランプ**)。`setInterval/setTimeout` をゲーム進行に使わない。
- 先生パネルを開くとplayは自動pause(タイマー停止・音声suspend)。閉じたとき**設定が変更されていればplayを最初からやり直す**(途中結果は破棄・記録しない)。無変更なら「3・2・1」表示後に再開。
- タブ非表示(visibilitychange)で自動pause。復帰時は「タッチして つづける」オーバーレイ。
- 縦持ち検知でOrientationGuardが自動表示され、その間playはpause。
- 制限時間・回数の管理はcoreが行い、満了時に自動で `onFinish` を呼ぶ。アプリ側から終了する場合は `ctx.end()` を呼ぶ。

---

## 2. SettingsSchema

```javascript
settings: {
  size: { type: "choice", label: "大きさ", default: "xl",
          options: [ {value:"xl",label:"特大"}, {value:"l",label:"大"},
                     {value:"m",label:"中"},  {value:"s",label:"小"} ] },
  count: { type: "range", label: "同時に出る数", min: 1, max: 3, step: 1, default: 1 },
  hint:  { type: "toggle", label: "ヒント光", default: true }
}
```

### 2-1. 型は3種のみ

| type | 追加フィールド | 保存値 | パネル表示 |
|---|---|---|---|
| choice | `options: {value: string, label: string}[]` | options内の**value(ASCII)** | セグメントボタン |
| range | `min, max, step=1` | number | −/+ステッパー |
| toggle | — | boolean | スイッチ |

- **valueは必ずASCII**とし、一度リリースしたら変更しない(digest・保存値の互換のため)。labelは表示専用でいつでも変更可。
- 全項目に `difficulty?: boolean = true` を指定できる。`difficulty:false` は難易度に無関係な設定(絵柄テーマ等)を意味し、digest(§3-2)から除外される。
- 新しい型が必要な場合はvt-settingsを拡張し**本書に追記してから**使う。

### 2-2. coreが自動付与する共通設定(予約キー)

以下はcoreが全アプリのスキーマ末尾に自動追加する。**アプリ側で同名キーを定義してはならない**: `sound`(音・toggle)/`reduceMotion`(動きひかえめ・toggle)/`mirror`(左右反転レイアウト・toggle)/`contrast`(背景: 生成り/白/黒・choice)。いずれも `difficulty:false`。値は `ctx.settings` から読める。

### 2-3. 検証規則(読込時・設定コード適用時に共通)

未知のchoice値→default/rangeはmin〜maxにクランプ/型不一致・未知キー→無視。検証を通った値のみ保存する。

---

## 3. RecordSchema

```javascript
record: {
  primary: { key: "hits", label: "タッチできた かず", betterIs: "higher" },   // betterIs: "higher" | "lower"
  extras:  [ { key: "avgRt", label: "平均反応時間", unit: "ms" } ]
}
```

### 3-1. 保存の挙動(coreが自動実行)

- `onFinish` の戻り値からprimary/extrasのkeyを取り出し、`日付(ローカルYYYY-MM-DD)`・`digest` を付けてrecent(最大10件)に保存。bestは `betterIs` に従って更新。
- **前回比の表示条件は「同一digest かつ 同日」**。結果画面・ベスト演出はprimaryのみを対象とし、extrasは先生モード内でのみ表示。
- 中断終了では一切保存しない。

### 3-2. digest(規範)

`difficulty:false` を除く全設定のvalueを**スキーマ定義順**に `/` で連結した文字列(例: `"xl/full/1/60s"`)。

---

## 4. ctx リファレンス(全コールバック共通で渡されるコンテキスト)

### 4-1. プロパティ・メソッド

| 名前 | 型 | 説明 |
|---|---|---|
| ctx.settings | object(読取専用) | 検証済みの現在設定(共通設定§2-2含む) |
| ctx.stage | HTMLElement | ステージ要素。アプリが生成する刺激はこの子要素として追加する |
| ctx.rect() | `() => {w, h}` | ステージの現在実寸。**出現位置の計算は毎回これを使う**(固定解像度ハードコード禁止) |
| ctx.dt | number | onTick内のみ有効。経過ms(≤100) |
| ctx.elapsed / ctx.remaining | number | プレイ経過ms/残りms(回数制のときremainingは残り回数) |
| ctx.score | number | 汎用スコア(play開始時0)。読み書き自由 |
| ctx.data | object | アプリ自由領域。play開始時に `{}` へリセット |
| ctx.addTarget(el, data?) | `(HTMLElement, any) => void` | 要素をタップ対象として登録(§4-2) |
| ctx.removeTarget(el) / ctx.clearTargets() | | 登録解除/全解除 |
| ctx.end() | `() => void` | playを正常終了し onFinish → 結果画面へ |
| ctx.feedback | object | §6のVT.Feedbackをアプリ文脈に束縛したショートカット(`ctx.feedback.success(el)` 等) |

### 4-2. onTouch(ctx, target) の target

`ctx.addTarget()` 済み要素へのタップで呼ばれる。`target = { el, data, x, y, pointerId, timeStamp }`(x,yはステージ座標)。`stageTouch:true` のアプリでは、ターゲット外タップ時に `target = null` で呼ばれる。デバウンス(同一要素300ms)はcoreが適用済み。反応時間の計測には `target.timeStamp` を使う(`Date.now()` 禁止)。

---

## 5. VT.Input — 入力ユーティリティ(Pointer Events実装)

アプリが独自UI要素に直接ハンドラを付ける場合に使う(通常のターゲット判定は§4で足りる)。ハンドラに渡るイベントは `{ x, y, pointerId, timeStamp, el }`。

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Input.tap | `(el, handler, opts?: {debounce=300})` | pointerdown基準のタップ。同一要素デバウンス付き |
| VT.Input.drag | `(el, {onStart?, onMove, onEnd?}, opts?: {clampToStage=true})` | ドラッグ追跡(pointerIdで識別・マルチタッチ安全) |
| VT.Input.hold | `(el, {ms=3000, tolerance=10}, onComplete)` | 長押し検出(移動tolerance px超で解除) |
| VT.Input.press | `(el, {onDown, onUp})` | 押下・離しの生検出(HoldGuard=「押さえ続ける」判定用) |

---

## 6. VT.Feedback — 演出と合成音

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Feedback.success | `(elOrPoint, opts?: {style?: "bounce"|"hanamaru"|"confetti"|"auto"})` | 正解演出+正解音。`"auto"`(既定)は3種をローテーション |
| VT.Feedback.soft | `(el)` | 不正解の静かな揺れ(**音なし**)。これ以外の不正解演出を作らない |
| VT.Feedback.play | `(name)` | 効果音のみ再生。name: `"seikai1"〜"seikai3" / "kirakira" / "fanfare" / "countdown" / "tap"`。ネガティブ音は存在させない |

**音の規範**: AudioContextはアプリ全体で1個。**スタートボタンのpointerdownで遅延生成/resume**する(ページ読込時に生成しない)。`settings.sound === false` の間は生成せず、全再生関数はno-op。全音400ms以下・マスターGain既定0.3。pause中はsuspend。`reduceMotion:true` のとき演出アニメは簡略化されるが、課題に必須の動き(VT.Motion.move)は影響を受けない。

---

## 7. VT.Storage — アプリ自由データの保存

設定と記録はcoreが管理する(アプリは `vt.<id>.settings` / `vt.<id>.records` に**直接触れない**)。それ以外の永続データ(例: A-03のたまごコレクション)用に以下を公開する。キーは自動で `vt.<appId>.x.<key>` に名前空間化される。

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Storage.get | `(key, fallback) => any` | JSONパース込み。破損・不在時はfallback(例外を投げない) |
| VT.Storage.set | `(key, value) => boolean` | JSON化して保存。容量超過等の失敗時false |
| VT.Storage.remove | `(key)` | 削除 |

バックエンドは現在LocalStorage。大容量データ(作品・軌跡・写真)向けにIndexedDBへ差し替え可能な抽象化とし、**このAPIは変えない**(設計書8-4)。

---

## 8. VT.Stim — 自作SVG刺激

色はthemes.cssのCSS変数(`var(--stim-red)` 等)を使う。生成物はSVGElementで、そのままstageへappendできる。

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Stim.card | `(theme, name?, opts?: {size=120}) => SVGElement` | 絵カード。name省略でテーマ内ランダム |
| VT.Stim.random | `(theme, opts?: {exclude: string[]}) => {name, el}` | 除外指定付きランダム(妨害刺激の生成に) |
| VT.Stim.shape | `({shape, color, size}) => SVGElement` | shape: `"circle"|"triangle"|"square"|"star"|"heart"` |
| VT.Stim.themes / VT.Stim.list | `() => string[]` / `(theme) => string[]` | テーマ一覧/テーマ内カード名一覧 |

## 9. VT.Motion — 移動・アニメーション

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Motion.move | `(el, {path, speed, area?}) => ctrl` | 連続移動。path: `"lineH"|"lineV"|"circle"|"eight"|"random"`、speedはpx/秒。戻り値ctrl: `{pause(), resume(), stop(), pos(): {x,y}}`。シーンのpauseと自動連動 |
| VT.Motion.tween | `(el, props, ms, ease="easeOut") => Promise` | 単発補間(props: x/y/scale/opacity) |

## 10. VT.Rand — 乱数と出現位置

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Rand.int | `(min, max) => number` | 両端含む整数 |
| VT.Rand.pick / VT.Rand.shuffle | `(arr) => item` / `(arr) => arr'` | 選択/新配列シャッフル |
| VT.Rand.pos | `({size, avoid?, area?}) => {x, y}` | **出現位置の規範実装**: ステージ端から24px以上内側・要素が完全に収まる位置を返す。`avoid: {x,y}` 指定時は対象1個分(size px)以上離す。`area: "full"(既定)|"center"|"left"|"right"|"bottom"` |

## 11. VT.Scene — 公開部分

| 関数 | シグネチャ | 説明 |
|---|---|---|
| VT.Scene.dialog | `({text, yesLabel="はい", noLabel="もどる"}) => Promise<boolean>` | 共通2択ダイアログ(`alert/confirm` の使用は禁止) |
| VT.Scene.goTitle / VT.Scene.goCatalog | `() => void` | タイトルへ/カタログ(../../index.html)へ |

---

## 12. 内部モジュール(app.jsから呼び出し禁止)

| モジュール | 役割 | 規範メモ |
|---|---|---|
| VT.Settings(vt-settings) | スキーマ検証・先生パネル自動生成・簡易ロック・**設定コード** | 設定コード: `?s=base64url(JSON)`、JSON=`{v:1, id, set:{key:value}}`。id一致時のみ§2-3の検証を通して適用・保存。不正コードは無視して通常起動 |
| VT.Chart(vt-chart) | 直近10回グラフ(結果画面・先生モード) | primaryのみ描画。betterIs:"lower"は「短いほど伸びる」メタファーで反転表現 |
| SceneManager(vt-scene) | 画面遷移・pause・OrientationGuard・TeacherPanel・ResultScreen | OrientationGuardは `matchMedia("(orientation: portrait)")`+resizeで検知(`window.orientation` 不使用) |
| RecordStore(vt-storage内) | records/settingsの読み書き・「きろくをリセットして交代」・「きろくをけす」 | アプリからの直接操作禁止 |

---

## 13. 最小実装例(C-01の骨格・約40行)

```javascript
(function () { 'use strict';
VT.createApp({
  meta: { id: "c01-target-touch", title: "タッチであつまれ!" },
  settings: {
    size: { type: "choice", label: "大きさ", default: "xl",
            options: [{value:"xl",label:"特大"},{value:"l",label:"大"},
                      {value:"m",label:"中"},{value:"s",label:"小"}] },
    area: { type: "choice", label: "出現範囲", default: "full",
            options: [{value:"center",label:"中央"},{value:"full",label:"全画面"},
                      {value:"left",label:"左半分"},{value:"right",label:"右半分"},
                      {value:"bottom",label:"下半分"}] },
    duration: { type: "choice", label: "時間", default: "60s",
            options: [{value:"30s",label:"30秒"},{value:"60s",label:"1分"},
                      {value:"120s",label:"2分"},{value:"n10",label:"10回"}] },
    theme: { type: "choice", label: "絵柄", default: "animals", difficulty: false,
            options: [{value:"animals",label:"どうぶつ"},{value:"fruits",label:"くだもの"}] }
  },
  record: {
    primary: { key: "hits", label: "タッチできた かず", betterIs: "higher" },
    extras:  [ { key: "avgRt", label: "平均反応時間", unit: "ms" } ]
  },
  onStart(ctx) { ctx.data.rts = []; ctx.data.shownAt = 0; spawn(ctx); },
  onTouch(ctx, target) {
    if (!target) return;
    ctx.data.rts.push(target.timeStamp - ctx.data.shownAt);
    ctx.score += 1;
    ctx.feedback.success(target.el);
    target.el.remove(); ctx.clearTargets();
    spawn(ctx);
  },
  onFinish(ctx) {
    const rts = ctx.data.rts;
    const avg = rts.length ? Math.round(rts.reduce(function(a,b){return a+b;},0) / rts.length) : 0;
    return { hits: ctx.score, avgRt: avg };
  }
});
function spawn(ctx) {
  const sizes = { xl: 180, l: 140, m: 110, s: 80 };
  const size = sizes[ctx.settings.size];
  const picked = VT.Stim.random(ctx.settings.theme, {});
  const el = picked.el;
  el.setAttribute("width", size); el.setAttribute("height", size);
  const p = VT.Rand.pos({ size: size, area: ctx.settings.area });
  el.style.cssText = "position:absolute;left:" + p.x + "px;top:" + p.y + "px";
  ctx.stage.appendChild(el);
  ctx.addTarget(el);
  ctx.data.shownAt = performance.now();
}
})();
```

※「時間」設定(`duration`)のようにcoreのタイマーが解釈する予約的な値形式(`"30s"/"n10"` 等)の対応表は次節(13-1)のとおり確定した。

---

## 13-1. settingsキー `duration` の予約解釈(vt-scene.js実装により確定。spec-c01.md §7より転記)

アプリのsettingsスキーマに **キー名が厳密に `duration`** の項目がある場合のみ、coreはその値を予約的な形式として解釈する。`duration` というキーが無いアプリはこの節の対象外(制限時間・終了判定は完全にアプリ側の`ctx.end()`に委ねられる)。

| `duration` の値の形式 | 例 | coreの挙動 |
|---|---|---|
| `/^(\d+)s$/`(数字+`s`) | `"30s"`, `"60s"`, `"120s"` | **時間制**。`ctx.remaining`は残りms。経過msが閾値に達すると、coreが自動的に`onFinish`を呼ぶ(アプリ側で`ctx.end()`を呼ぶ必要はない) |
| `/^n(\d+)$/`(`n`+数字) | `"n10"`, `"n3"` | **回数制**。`ctx.remaining`は「その数値 − `ctx.score`」(残り回数)。**自動満了なし**。終了はアプリが`ctx.end()`を呼んで行う |
| 上記いずれにも一致しない値 | — | 予約解釈は行われない(`ctx.remaining`は`null`のまま。終了は`ctx.end()`任せ) |

- TimerBar(時間バー)等の視覚表示はUI実装側の責務だが、上記の`ctx.remaining`の意味づけに従って描画する。
- `count`型(range)の設定と混同しないこと。`duration`は必ず`choice`型として定義し、値(value)は上記形式のASCII文字列にする。

---

## 14. 変更管理

- 本書のヘッダに版と日付を持ち、変更はcoreと同一コミットで行う。
- 追加提案の書式: 「提案API/シグネチャ/必要とするアプリ/既存APIで代替できない理由」。承認後にcore実装→本書追記→利用、の順を守る。
