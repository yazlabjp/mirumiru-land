/**
 * vt-core.js — VT名前空間の起点 + VT.Rand(乱数と出現位置)
 * 対象: docs/vt-api.md §10
 *
 * 読み込み順序の先頭(vt-api.md §0)。他のcoreモジュール(vt-input.js等)は
 * このファイルが作る window.VT に自身のプロパティを追加していく。
 *
 * classic script + IIFE + 'use strict'(ES Modules禁止 / ai-notes.md §0-3)。
 */
(function () {
  'use strict';

  if (window.VT) {
    // 二重読み込み時は既存の名前空間を壊さない。
    return;
  }

  var VT = {};

  // ---- 内部専用ユーティリティ(app.jsから呼び出し禁止。vt-api.md §12と同様の扱い) ----
  VT._util = {
    clamp: function (v, min, max) {
      if (min > max) { var t = min; min = max; max = t; }
      return Math.min(Math.max(v, min), max);
    }
  };

  // ---- 内部専用: 現在実行中のアプリID ----
  // VT.createApp(def) が meta.id で登録する(vt-scene.js)。
  // VT.Storage.get/set/remove はappId引数を取らない(vt-api.md §7)ため、ここから読む。
  VT._app = {
    id: null,
    setId: function (id) { this.id = id; }
  };

  // ============================================================
  // VT.Rand — 乱数と出現位置(vt-api.md §10)
  // ============================================================
  var Rand = {};

  var EDGE_MARGIN = 24; // ai-notes.md §2: ステージ端から24px以上内側

  /** 両端含む整数乱数 */
  Rand.int = function (min, max) {
    var lo = Math.min(min, max);
    var hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  };

  /** 配列から1つ選ぶ */
  Rand.pick = function (arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Rand.int(0, arr.length - 1)];
  };

  /** 新しい配列としてシャッフル(元配列は変更しない) */
  Rand.shuffle = function (arr) {
    var copy = (arr || []).slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Rand.int(0, i);
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  function randInRange(min, max) {
    if (min >= max) return min;
    return Math.random() * (max - min) + min;
  }

  function getStageSize() {
    var stageEl = document.getElementById('stage');
    if (stageEl && typeof stageEl.getBoundingClientRect === 'function') {
      var r = stageEl.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }
    // フォールバック(#stageが無いテスト環境等)
    return { w: window.innerWidth || 0, h: window.innerHeight || 0 };
  }

  /**
   * area指定に応じた出現可能範囲(要素の左上座標として取り得るmin/max)を求める。
   * 先に端24px以上マージンを適用し、その後area(center/left/right/bottom)で絞り込む。
   */
  function computeAreaBounds(area, w, h, size) {
    var minX = EDGE_MARGIN;
    var maxX = w - EDGE_MARGIN - size;
    var minY = EDGE_MARGIN;
    var maxY = h - EDGE_MARGIN - size;

    if (area === 'center') {
      minX = Math.max(minX, w * 0.25);
      maxX = Math.min(maxX, w * 0.75 - size);
      minY = Math.max(minY, h * 0.25);
      maxY = Math.min(maxY, h * 0.75 - size);
    } else if (area === 'left') {
      maxX = Math.min(maxX, w * 0.5 - size);
    } else if (area === 'right') {
      minX = Math.max(minX, w * 0.5);
    } else if (area === 'bottom') {
      minY = Math.max(minY, h * 0.5);
    }
    // area === 'full'(既定)は追加制限なし

    // sizeがエリアに対して大きすぎる等でmin>maxになったら、範囲をmin側へ潰す(クラッシュ防止)。
    if (minX > maxX) maxX = minX;
    if (minY > maxY) maxY = minY;

    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  /**
   * 出現位置の規範実装(ai-notes.md §2 / vt-api.md §10)。
   * opts: { size, avoid?: {x,y}, area?: "full"|"center"|"left"|"right"|"bottom" }
   * 戻り値: {x, y}(ステージ左上原点・要素の左上座標)
   */
  Rand.pos = function (opts) {
    opts = opts || {};
    var size = opts.size || 0;
    var area = opts.area || 'full';
    var avoid = opts.avoid || null;

    var stageSize = getStageSize();
    var bounds = computeAreaBounds(area, stageSize.w, stageSize.h, size);

    var candidate = null;
    var maxAttempts = 20; // spec-c01.md §5-2と同じ「最大20回で妥協」の規範に合わせる

    for (var i = 0; i < maxAttempts; i++) {
      candidate = {
        x: randInRange(bounds.minX, bounds.maxX),
        y: randInRange(bounds.minY, bounds.maxY)
      };
      if (!avoid) break;
      var dx = candidate.x - avoid.x;
      var dy = candidate.y - avoid.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= size) break; // 対象1個分以上離れていればOK
    }

    return candidate || { x: bounds.minX, y: bounds.minY };
  };

  VT.Rand = Rand;

  window.VT = VT;
})();
