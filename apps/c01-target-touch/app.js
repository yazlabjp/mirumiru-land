/**
 * app.js — C-01 タッチであつまれ!(docs/specs/c01.md 準拠)
 *
 * 根拠: docs/vt-api.md(API正) + docs/ai-notes.md(実装規約) + docs/specs/c01.md(本アプリ仕様)。
 *
 * 実装メモ(仕様の曖昧箇所の解決・実装AIへの申し送り):
 * spec-c01.md §5-2「ヒット時」の手順は文面上、
 *   (2) ctx.feedback.success(target.el) を呼ぶ
 *   (3) 直後に target.el を即座にDOMから除去する(「演出と干渉しないよう」「除去アニメはFeedbackFXに任せる」)
 * の順で書かれているが、要素を即座に除去すると(2)でその要素に付与したCSSアニメーションクラスは
 * 画面から消えた要素の上で意味を失う。vt-api.md §6のctx.feedback.success()が要素だけでなく
 * ステージ座標{x,y}も受け付ける設計になっているのは、まさにこの「要素は消すが、その場の演出は
 * 独立して残す」ケースのためと判断し、本実装では target.el の中心座標を算出して
 * ctx.feedback.success({x, y}) を呼ぶ(要素ではなく座標を渡す)ことで、
 * 「即座に除去」と「除去アニメ(演出)はFeedbackFXに任せる」を矛盾なく両立させた。
 * この解釈が意図と異なる場合はご指摘ください。
 */
(function () {
  'use strict';

  // 数値対応表(規範。spec-c01.md §3)
  var SIZE_PX = { xl: 180, l: 140, m: 110, s: 80 };
  var PACE_MS = { fast: 0, normal: 400, slow: 900 };
  var MAX_SPAWN_ATTEMPTS = 20; // spec-c01.md §5-2: 最大20回で妥協して採用する(無限ループ禁止)

  /** mirror:trueのときareaのleft/rightを入れ替えて解釈する(spec-c01.md §3。それ以外のareaは無効果)。 */
  function effectiveArea(ctx) {
    var area = ctx.settings.area;
    if (ctx.settings.mirror) {
      if (area === 'left') return 'right';
      if (area === 'right') return 'left';
    }
    return area;
  }

  /** 既存ターゲットと中心間距離 < size なら重なりとみなす(spec-c01.md §5-2 手順3)。 */
  function overlapsExisting(pos, size, active) {
    var cx = pos.x + size / 2;
    var cy = pos.y + size / 2;
    return active.some(function (a) {
      var acx = a.x + a.size / 2;
      var acy = a.y + a.size / 2;
      var dx = cx - acx;
      var dy = cy - acy;
      return Math.sqrt(dx * dx + dy * dy) < size;
    });
  }

  function removeFromActive(ctx, el) {
    ctx.data.active = ctx.data.active.filter(function (a) { return a.el !== el; });
  }

  /** 誘導ヒント(spec-c01.md §5-2 手順4): 最初の1個だけ、最初のヒットまで。 */
  function applyHint(ctx, el) {
    ctx.data.hintEl = el;
    if (ctx.settings.reduceMotion) {
      el.classList.add('vt-c01-hint-border');
    } else {
      el.classList.add('vt-c01-hint-blink');
    }
  }
  function clearHint(el) {
    if (!el) return;
    el.classList.remove('vt-c01-hint-blink');
    el.classList.remove('vt-c01-hint-border');
  }

  /** ターゲットを1個出現させる(onStartの初期配置・補充の両方から呼ぶ)。 */
  function spawnOne(ctx, opts) {
    opts = opts || {};
    var theme = ctx.settings.theme;
    var sizePx = SIZE_PX[ctx.settings.size];
    var area = effectiveArea(ctx);
    var existingNames = ctx.data.active.map(function (a) { return a.name; });

    // 手順1: 画面上に同時に存在するカードは絵柄が重複しないよう除外する
    var picked = VT.Stim.random(theme, { exclude: existingNames, size: sizePx });
    var el = picked.el;

    // 手順2〜3: 位置決定(直前のヒット位置を避け、既存ターゲットと重ならないよう最大20回試行)
    var avoidPoint = ctx.data.lastHitPos;
    var pos = null;
    for (var attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      var candidate = VT.Rand.pos({ size: sizePx, area: area, avoid: avoidPoint });
      pos = candidate;
      if (!overlapsExisting(candidate, sizePx, ctx.data.active)) break;
    }

    el.style.position = 'absolute';
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    ctx.stage.appendChild(el);

    var shownAt = performance.now();
    ctx.data.active.push({ el: el, name: picked.name, size: sizePx, x: pos.x, y: pos.y });
    ctx.addTarget(el, { name: picked.name, size: sizePx, x: pos.x, y: pos.y, shownAt: shownAt });

    // 手順4: 各プレイの最初の1個だけ誘導ヒント
    if (opts.isFirst) {
      applyHint(ctx, el);
    }
  }

  VT.createApp({
    meta: {
      id: 'c01-target-touch',
      title: 'タッチであつまれ!'
    },

    settings: {
      size: {
        type: 'choice', label: '大きさ', default: 'xl',
        options: [
          { value: 'xl', label: '特大' }, { value: 'l', label: '大' },
          { value: 'm', label: '中' }, { value: 's', label: '小' }
        ]
      },
      area: {
        type: 'choice', label: '出現範囲', default: 'full',
        options: [
          { value: 'center', label: '中央' }, { value: 'full', label: '全画面' },
          { value: 'left', label: '左半分' }, { value: 'right', label: '右半分' },
          { value: 'bottom', label: '下半分' }
        ]
      },
      count: { type: 'range', label: '同時に出る数', min: 1, max: 3, step: 1, default: 1 },
      pace: {
        type: 'choice', label: 'つぎが出るまで', default: 'normal',
        options: [
          { value: 'fast', label: 'すぐ' }, { value: 'normal', label: 'ふつう' },
          { value: 'slow', label: 'ゆっくり' }
        ]
      },
      duration: {
        type: 'choice', label: '時間', default: '60s',
        options: [
          { value: '30s', label: '30秒' }, { value: '60s', label: '1分' },
          { value: '120s', label: '2分' }, { value: 'n10', label: '10回タッチ' }
        ]
      },
      theme: {
        type: 'choice', label: '絵柄', default: 'animals', difficulty: false,
        options: [
          { value: 'animals', label: 'どうぶつ' }, { value: 'fruits', label: 'くだもの' },
          { value: 'vehicles', label: 'のりもの' }
        ]
      }
    },

    record: {
      primary: { key: 'hits', label: 'タッチできた かず', betterIs: 'higher' },
      extras: [{ key: 'avgRt', label: '平均反応時間', unit: 'ms' }]
    },

    // stageTouch: 使わない(既定false)。ミスタッチは完全に無視する(spec-c01.md §2, §5-2)。

    onStart: function (ctx) {
      ctx.data.rts = [];
      ctx.data.active = [];
      ctx.data.pendingSpawns = []; // pace遅延中の補充待ちリスト(残りms)。setTimeoutは使わない(ai-notes.md §1)
      ctx.data.lastHitPos = null;
      ctx.data.hintEl = null;

      var count = ctx.settings.count;
      for (var i = 0; i < count; i++) {
        spawnOne(ctx, { isFirst: i === 0 });
      }
    },

    onTick: function (ctx) {
      if (ctx.data.pendingSpawns.length === 0) return;
      var stillWaiting = [];
      for (var i = 0; i < ctx.data.pendingSpawns.length; i++) {
        var remaining = ctx.data.pendingSpawns[i] - ctx.dt;
        if (remaining <= 0) {
          spawnOne(ctx, { isFirst: false });
        } else {
          stillWaiting.push(remaining);
        }
      }
      ctx.data.pendingSpawns = stillWaiting;
    },

    onTouch: function (ctx, target) {
      if (!target) return; // ミスタッチ(ターゲット外)は完全に無視する

      var data = target.data;
      var rt = target.timeStamp - data.shownAt; // 両方performance.now()系(PointerEvent.timeStamp)の軸(ai-notes.md §8)
      ctx.data.rts.push(rt);
      ctx.score += 1;

      // 最初のヒットで誘導ヒントを解除する(ヒント対象自身がヒットされた場合も含め安全に処理)
      if (ctx.data.hintEl) {
        clearHint(ctx.data.hintEl);
        ctx.data.hintEl = null;
      }

      // 演出(実装メモ参照): 要素ではなく座標で呼び、要素は即座に除去する
      var cx = data.x + data.size / 2;
      var cy = data.y + data.size / 2;
      ctx.feedback.success({ x: cx, y: cy });

      ctx.removeTarget(target.el);
      if (target.el.parentNode) target.el.parentNode.removeChild(target.el);
      removeFromActive(ctx, target.el);

      ctx.data.lastHitPos = { x: data.x, y: data.y };

      // duration="n10"等の回数制: 目標回数に達したら補充せず終了する(vt-api.md §13-1 / spec-c01.md §5-2手順5)
      var countMatch = /^n(\d+)$/.exec(ctx.settings.duration);
      if (countMatch && ctx.score >= parseInt(countMatch[1], 10)) {
        ctx.end();
        return;
      }

      // pace の遅延後に補充ターゲットを1個出現させ、常に count 個を維持する
      ctx.data.pendingSpawns.push(PACE_MS[ctx.settings.pace]);
    },

    onFinish: function (ctx) {
      var rts = ctx.data.rts;
      var avgRt = 0;
      if (rts.length > 0) {
        var sum = rts.reduce(function (a, b) { return a + b; }, 0);
        avgRt = Math.round(sum / rts.length);
      }
      return { hits: ctx.score, avgRt: avgRt };
    }

    // onAbort: 不要(ターゲットはcoreのシーン破棄で消えるため。spec-c01.md §5-4)
  });
})();
