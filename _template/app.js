/**
 * app.js — このアプリ固有のロジックのみ(vt-api.md §1)
 *
 * 実装前に docs/ai-notes.md + docs/vt-api.md + docs/specs/<このアプリ>.md
 * の3点を必ず確認すること(design.md §8-8)。
 *
 * 守ること(ai-notes.md §0 最重要指示):
 * - 外部リソース参照禁止(CDN・Google Fonts等)。相対パスのみ。
 * - フレームワーク・ビルド禁止(素のHTML/CSS/JS)。
 * - ES Modules禁止(import/export・<script type="module">は使わない)。
 * - vt-api.mdに存在しないVT関数を呼ばない。無ければ「vt-api.mdへの追加提案」として報告する。
 * - alert()/confirm()/prompt()を使わない(VT.Scene.dialogを使う)。
 * - 児童生徒向け画面に失敗情報(ミス回数・誤答率・ネガティブ表現)を表示しない。
 */
(function () {
  'use strict';

  VT.createApp({
    meta: {
      id: "REPLACE-ME-folder-name-and-this-must-match", // 例: "c01-target-touch"(フォルダ名・apps.jsonと完全一致させる)
      title: "REPLACE-ME-アプリ名"
    },

    // 設定スキーマ(vt-api.md §2)。type は choice/range/toggle の3種のみ。
    // sound/reduceMotion/mirror/contrast はcoreが自動付与するのでここに書かない(vt-api.md §2-2)。
    settings: {
      // 例:
      // size: { type: "choice", label: "大きさ", default: "xl",
      //   options: [
      //     { value: "xl", label: "特大" },
      //     { value: "l",  label: "大" },
      //     { value: "m",  label: "中" },
      //     { value: "s",  label: "小" }
      //   ] },
      // count: { type: "range", label: "同時に出る数", min: 1, max: 3, step: 1, default: 1 }
    },

    // 記録スキーマ(vt-api.md §3)。primaryは必須・1つだけ。extrasは先生モード内でのみ表示される。
    record: {
      primary: { key: "hits", label: "できた かず", betterIs: "higher" }, // betterIs: "higher" | "lower"
      extras: []
    },

    // stageTouch: true にすると、ターゲット外(ステージ全面)のタップでも onTouch(ctx, null) が呼ばれる。
    // stageTouch: false,

    /** playシーン開始のたびに毎回呼ばれる(「もういっかい」でも)。刺激の初期配置を行う。 */
    onStart: function (ctx) {
      // 例: ctx.data.rts = []; spawn(ctx);
    },

    /** 毎フレーム呼ばれる(rAF駆動)。ctx.dtを使う。静的な課題では丸ごと削除してよい。 */
    // onTick: function (ctx) {
    // },

    /** ctx.addTarget()済み要素へのタップ時に呼ばれる。targetは { el, data, x, y, pointerId, timeStamp }。 */
    // onTouch: function (ctx, target) {
    //   if (!target) return;
    //   ctx.score += 1;
    //   ctx.feedback.success(target.el);
    //   ctx.removeTarget(target.el);
    // },

    /** 正常終了時のみ呼ばれる。record.primary/extrasのkeyを持つオブジェクトを返す。 */
    onFinish: function (ctx) {
      return { hits: ctx.score };
    }

    /** 中断終了(「おわる」→はい)時の後始末が必要なら追加する。記録は保存されない。 */
    // , onAbort: function (ctx) {
    // }
  });
})();
