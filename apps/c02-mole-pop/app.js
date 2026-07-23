/**
 * app.js — C-02 もぐらぽん(docs/specs/c02.md 準拠)
 *
 * 根拠: docs/vt-api.md(API正) + docs/ai-notes.md(実装規約) + docs/specs/c02.md(本アプリ仕様)。
 *
 * 実装メモ(仕様の曖昧箇所の解決・実装AIへの申し送り):
 * 1. spec-c02.md §4-1手順1「ctx.feedback.success(target.el)を呼んで即座に穴を空きに戻す」について、
 *    要素を本当に即座にDOMから除去するとvt-feedback.jsが付与するCSSアニメーションクラス
 *    (vt-fx-bounce等、最長700ms)が描画される前に消えてしまい、正解の華やかな反応(原則3)が
 *    見えなくなる。そこで「穴を空きに戻す」は次のもぐらを出せる状態にする(データ上の解放)と
 *    解釈し、要素自体の除去は演出時間分だけ遅らせる(cleanupQueueで管理。setTimeoutは使わず
 *    onTickのdt積算で行う。ai-notes.md §1)。NGタッチのctx.feedback.soft(300ms)も同様。
 * 2. spec-c02.md §4-1手順4「静かに引っ込むtweenの後ctx.removeTarget(el)」について、
 *    引っ込みtween中(200ms)もタッチ対象のままにすると、タイムアウトとヒットが同時に競合して
 *    二重処理になりうる。安全のためタイムアウト成立と同時にremoveTargetし、その直後に
 *    引っ込みtweenを行う(「穴が空きに戻る」タイミング=tween完了後、という部分はspec通り)。
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // 数値対応表(規範。spec-c02.md §2)
  var GRID = {
    '4': { cols: 2, rows: 2 },
    '6': { cols: 3, rows: 2 },
    '9': { cols: 3, rows: 3 }
  };
  var POP_TIME_MS = { long: 2000, normal: 1200, fast: 700 };
  var NG_RATE = 0.10; // spec-c02.md §2「もぐら出現のたびに約10%の確率でNGキャラに差し替え」

  var EDGE_MARGIN = 24; // ai-notes.md §2と同じ端マージン
  var RISE_MS = 200; // spec-c02.md §4-1手順3「y方向・200ms程度」
  var RETRACT_MS = 200; // 引っ込みもせり上がりと同じ長さにする(specに数値指定なし)
  var RESPAWN_GAP_MS = 250; // 穴が空いてから次を出すまでの「短い間隔」(spec-c02.md §4-1手順5。数値指定なしのため採用)
  var HIT_CLEANUP_MS = 750; // successの演出(最長700ms=confetti)を再生しきるまでの要素保持猶予
  var NG_CLEANUP_MS = 350; // softの演出(300ms)を再生しきるまでの要素保持猶予

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    return e;
  }

  /** 穴(常時表示・非タッチ対象の背景要素)のSVGを作る(spec-c02.md §4-1)。 */
  function buildHoleEl(size) {
    var svg = svgEl('svg', { viewBox: '0 0 100 100', width: size, height: size, 'class': 'vt-c02-hole' });
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 80, rx: 44, ry: 14, fill: 'var(--ink)', opacity: 0.18 }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 74, rx: 32, ry: 12, fill: 'var(--ink)', opacity: 0.55 }));
    return svg;
  }

  /** もぐらのSVG(自作。絵文字は使わない。ai-notes.md §8)。 */
  function buildMoleEl(size) {
    var svg = svgEl('svg', { viewBox: '0 0 100 100', width: size, height: size, 'class': 'vt-stim vt-c02-critter' });
    svg.appendChild(svgEl('ellipse', { cx: 32, cy: 38, rx: 8, ry: 10, fill: 'var(--stim-brown)' }));
    svg.appendChild(svgEl('ellipse', { cx: 68, cy: 38, rx: 8, ry: 10, fill: 'var(--stim-brown)' }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 58, rx: 34, ry: 30, fill: 'var(--stim-brown)' }));
    svg.appendChild(svgEl('circle', { cx: 39, cy: 54, r: 4, fill: 'var(--stim-black)' }));
    svg.appendChild(svgEl('circle', { cx: 61, cy: 54, r: 4, fill: 'var(--stim-black)' }));
    svg.appendChild(svgEl('circle', { cx: 50, cy: 68, r: 5, fill: 'var(--stim-pink)' }));
    return svg;
  }

  /** NGキャラ: もぐらと形・色の両方が明確に異なるものにする(spec-c02.md §4-1手順2/二重符号化。developer-guide.md §4)。
   *  VT.Stim.shapeで十分に要件を満たすため自作SVGを重複実装しない(vt-api.md §8)。 */
  function buildNgEl(size) {
    var svg = VT.Stim.shape({ shape: 'star', color: 'var(--stim-red)', size: size });
    svg.classList.add('vt-c02-critter');
    return svg;
  }

  /** holes設定から穴のグリッド座標をctx.rect()の実寸から算出する(spec-c02.md §2数値対応表)。
   *  mirror:trueのとき列順(x座標の並び)を反転する(spec-c02.md §2)。 */
  function buildHoles(ctx) {
    var layout = GRID[ctx.settings.holes];
    var cols = layout.cols, rows = layout.rows;
    var rect = ctx.rect();
    var cellW = (rect.w - EDGE_MARGIN * 2) / cols;
    var cellH = (rect.h - EDGE_MARGIN * 2) / rows;
    var size = Math.max(72, Math.min(cellW, cellH) * 0.62); // 72px=タッチ最小(developer-guide.md §3)

    var xs = [];
    var c;
    for (c = 0; c < cols; c++) {
      xs.push(EDGE_MARGIN + cellW * c + (cellW - size) / 2);
    }
    if (ctx.settings.mirror) xs.reverse();

    var ys = [];
    var r;
    for (r = 0; r < rows; r++) {
      ys.push(EDGE_MARGIN + cellH * r + (cellH - size) / 2);
    }

    var holes = [];
    var index = 0;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        holes.push({
          index: index++,
          x: xs[c], y: ys[r], size: size,
          state: 'empty', // 'empty' | 'rising' | 'up' | 'retracting'
          el: null,
          remainingMs: 0
        });
      }
    }
    return holes;
  }

  /** 穴の背景要素をまとめてstageに配置する(addTargetしない。spec-c02.md §4-1)。 */
  function renderHoles(ctx, holes) {
    holes.forEach(function (h) {
      var el = buildHoleEl(h.size);
      el.style.position = 'absolute';
      el.style.left = h.x + 'px';
      el.style.top = h.y + 'px';
      ctx.stage.appendChild(el);
    });
  }

  /** 空いている穴を1つ選ぶ。直前にヒット/引っ込みが起きた穴は他に選択肢があれば除外する(spec-c02.md §4-1手順1)。 */
  function pickSpawnHole(ctx) {
    var holes = ctx.data.holes;
    var empties = holes.filter(function (h) { return h.state === 'empty'; });
    if (empties.length === 0) return null;
    var candidates = empties;
    if (empties.length > 1 && ctx.data.lastResolvedHole !== null) {
      var filtered = empties.filter(function (h) { return h.index !== ctx.data.lastResolvedHole; });
      if (filtered.length > 0) candidates = filtered;
    }
    return VT.Rand.pick(candidates);
  }

  /** もぐら(またはNGキャラ)を1体出現させる(spec-c02.md §4-1手順1〜3)。 */
  function spawnOne(ctx) {
    var hole = pickSpawnHole(ctx);
    if (!hole) return;

    var isNG = !!ctx.settings.ngMole && Math.random() < NG_RATE;
    var el = isNG ? buildNgEl(hole.size) : buildMoleEl(hole.size);

    var restTop = hole.y - hole.size * 0.18; // 穴の縁から顔を出した位置
    var hiddenTop = hole.y + hole.size * 0.55; // 穴の底に隠れている位置

    el.style.position = 'absolute';
    el.style.left = hole.x + 'px';
    el.style.top = hiddenTop + 'px';
    el.style.opacity = '0';
    ctx.stage.appendChild(el);

    hole.state = 'rising';
    hole.el = el;

    VT.Motion.tween(el, { y: restTop, opacity: 1 }, RISE_MS, 'easeOut').then(function () {
      if (hole.state !== 'rising') return; // リスタート等でholeオブジェクトが差し替わっている場合の保険
      hole.state = 'up';
      hole.remainingMs = POP_TIME_MS[ctx.settings.popTime];
      ctx.addTarget(el, { shownAt: performance.now(), isNG: isNG, holeIndex: hole.index });
    });
  }

  /** popTime満了時の自動引っ込み(spec-c02.md §4-1手順4。失敗演出・失敗音は出さない)。 */
  function retractHole(ctx, hole) {
    hole.state = 'retracting';
    var el = hole.el;
    ctx.removeTarget(el); // 実装メモ2: タイムアウト成立と同時にタッチ対象から外す
    var hiddenTop = hole.y + hole.size * 0.55;
    VT.Motion.tween(el, { y: hiddenTop, opacity: 0 }, RETRACT_MS, 'easeOut').then(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      hole.state = 'empty';
      hole.el = null;
      ctx.data.lastResolvedHole = hole.index;
      ctx.data.pendingSpawns.push(RESPAWN_GAP_MS);
    });
  }

  /** 演出の再生猶予後に要素をDOMから除去する予約を積む(実装メモ1)。 */
  function scheduleCleanup(ctx, el, ms) {
    ctx.data.cleanupQueue.push({ el: el, ms: ms });
  }

  VT.createApp({
    meta: { id: 'c02-mole-pop', title: 'もぐらぽん' },

    // 設定スキーマ(spec-c02.md §2。このまま実装)
    settings: {
      holes: {
        type: 'choice', label: 'あなの かず', default: '6',
        options: [
          { value: '4', label: '4つ' }, { value: '6', label: '6つ' }, { value: '9', label: '9つ' }
        ]
      },
      popTime: {
        type: 'choice', label: 'でている じかん', default: 'normal',
        options: [
          { value: 'long', label: 'ながく' }, { value: 'normal', label: 'ふつう' }, { value: 'fast', label: 'みじかく' }
        ]
      },
      count: { type: 'range', label: 'どうじに出る かず', min: 1, max: 3, step: 1, default: 1 },
      ngMole: { type: 'toggle', label: 'ちがうこも まじる', default: false },
      duration: {
        type: 'choice', label: '時間', default: '60s',
        options: [
          { value: '30s', label: '30秒' }, { value: '60s', label: '1分' }, { value: '90s', label: '1分30秒' }
        ]
      }
    },

    // 記録スキーマ(spec-c02.md §3)
    record: {
      primary: { key: 'hits', label: 'たたけた かず', betterIs: 'higher' },
      extras: [
        { key: 'avgRt', label: '平均到達時間', unit: 'ms' },
        { key: 'ngTouched', label: 'ちがうこを タッチした かず', unit: '回' }
      ]
    },

    // stageTouch: 使わない(既定false)。穴以外・未出現の穴へのタッチは完全に無視する(spec-c02.md §4-1)。

    onStart: function (ctx) {
      var holes = buildHoles(ctx);
      ctx.data.rts = [];
      ctx.data.ngTouched = 0;
      ctx.data.holes = holes;
      ctx.data.pendingSpawns = [];
      ctx.data.cleanupQueue = [];
      ctx.data.lastResolvedHole = null;

      renderHoles(ctx, holes);

      var count = ctx.settings.count;
      for (var i = 0; i < count; i++) {
        spawnOne(ctx);
      }
    },

    onTick: function (ctx) {
      var holes = ctx.data.holes;
      var i;
      for (i = 0; i < holes.length; i++) {
        var h = holes[i];
        if (h.state === 'up') {
          h.remainingMs -= ctx.dt;
          if (h.remainingMs <= 0) retractHole(ctx, h);
        }
      }

      var pending = ctx.data.pendingSpawns;
      var stillWaiting = [];
      for (i = 0; i < pending.length; i++) {
        var remaining = pending[i] - ctx.dt;
        if (remaining <= 0) {
          spawnOne(ctx);
        } else {
          stillWaiting.push(remaining);
        }
      }
      ctx.data.pendingSpawns = stillWaiting;

      var cleanup = ctx.data.cleanupQueue;
      var stillCleaning = [];
      for (i = 0; i < cleanup.length; i++) {
        var item = cleanup[i];
        item.ms -= ctx.dt;
        if (item.ms <= 0) {
          if (item.el.parentNode) item.el.parentNode.removeChild(item.el);
        } else {
          stillCleaning.push(item);
        }
      }
      ctx.data.cleanupQueue = stillCleaning;
    },

    onTouch: function (ctx, target) {
      if (!target) return; // ミスタッチ・未出現の穴へのタッチは完全に無視する(spec-c02.md §4-1)

      var hole = ctx.data.holes[target.data.holeIndex];
      if (!hole || hole.state !== 'up') return; // 引っ込みタイムアウトとの競合等に対する保険

      var el = target.el;
      ctx.removeTarget(el);

      if (target.data.isNG) {
        ctx.data.ngTouched += 1;
        ctx.feedback.soft(el); // 静かな揺れのみ・音なし(spec-c02.md §4-1手順2)
        scheduleCleanup(ctx, el, NG_CLEANUP_MS);
      } else {
        ctx.data.rts.push(target.timeStamp - target.data.shownAt);
        ctx.score += 1;
        ctx.feedback.success(el);
        scheduleCleanup(ctx, el, HIT_CLEANUP_MS);
      }

      hole.state = 'empty';
      hole.el = null;
      ctx.data.lastResolvedHole = hole.index;
      ctx.data.pendingSpawns.push(RESPAWN_GAP_MS);
    },

    onFinish: function (ctx) {
      var rts = ctx.data.rts;
      var avgRt = 0;
      if (rts.length > 0) {
        var sum = rts.reduce(function (a, b) { return a + b; }, 0);
        avgRt = Math.round(sum / rts.length);
      }
      return { hits: ctx.score, avgRt: avgRt, ngTouched: ctx.data.ngTouched };
    }

    // onAbort: 不要(穴・もぐらの要素はcoreのシーン破棄で消えるため。spec-c02.md §4-3)
  });
})();
