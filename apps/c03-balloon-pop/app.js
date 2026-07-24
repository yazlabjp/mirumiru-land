/**
 * app.js — C-03 ふうせんパン(docs/specs/c03.md 準拠)
 *
 * 根拠: docs/vt-api.md(API正) + docs/ai-notes.md(実装規約) + docs/specs/c03.md(本アプリ仕様)。
 *
 * 実装メモ(仕様の曖昧箇所の解決・実装AIへの申し送り):
 * 1. spec-c03.md §4-1手順2「ctx.feedback.success(target.el)を呼び、ctx.removeTarget(target.el)後に
 *    elを除去する」について、要素を本当に即座にDOMから除去するとvt-feedback.jsが付与するCSS
 *    アニメーションクラス(vt-fx-bounce等、最長700ms=confetti)が描画される前に消えてしまい、
 *    正解の華やかな反応(developer-guide.md 原則3)が見えなくなる。c02-mole-popの実装メモと同じ
 *    理由により、要素自体の除去は演出時間分だけ遅らせる(cleanupQueueで管理。setTimeoutは使わず
 *    onTickのdt積算で行う。ai-notes.md §1)。
 * 2. VT.Motion.move(vt-api.md §9)のlineH/lineVは、要素固有のオフセットを持たない純粋な時間の
 *    関数(elapsedMsは各ctrl生成時刻からの経過msで、共有rAFループが同じdtを与える)。そのため
 *    同一onStart内でcount>=2の風船が同時に同じpath("lineH"または"lineV")を選ぶと、生成時刻が
 *    完全に一致し完全に重なって永久に同期してしまう(count=3では2種類のpathしかないため必ず
 *    衝突する)。coreの挙動は変更できない(core/v1は凍結)ため、初期出現分(2体目以降)の
 *    VT.Motion.move呼び出しをわずかに(INITIAL_STAGGER_MS間隔)ずらして開始することで、
 *    生成時刻をずらし完全同期を避ける。見た目の「同時に出現」感を損なわない範囲(数百ms)の
 *    ずれに留めており、spec手順1〜2自体は変更していない。ヒット時の即時補充(手順3)は
 *    既存の風船がすでに時間差で稼働しているため、この対策なしで自然に非同期になる。
 * 3. 出現規則1「VT.Stim.shape({shape:"circle", color:..., size})」のcolorは仕様に具体値の
 *    指定がないため、developer-guide.md §4の刺激色セット(--stim-red/-blue/-yellow/-green)から
 *    風船ごとにランダムに選ぶ(見分けやすさのための視覚的バリエーション。難易度には無関係)。
 */
(function () {
  'use strict';

  var SIZE_PX = { xl: 180, l: 140, m: 110, s: 80 };
  var SPEED_PX = { slow: 80, normal: 150, fast: 250 };
  var COLORS = ['var(--stim-red)', 'var(--stim-blue)', 'var(--stim-yellow)', 'var(--stim-green)'];

  var POP_CLEANUP_MS = 750; // successの演出(最長700ms=confetti)を再生しきるまでの要素保持猶予(実装メモ1)
  var INITIAL_STAGGER_MS = 300; // 初期出現分の生成時刻をずらす間隔(実装メモ2)

  /** 風船を1個生成し、移動を開始してタッチ対象に登録する(spec-c03.md §4-1出現規則)。 */
  function spawnOne(ctx) {
    var size = SIZE_PX[ctx.settings.size];
    var color = VT.Rand.pick(COLORS);
    var el = VT.Stim.shape({ shape: 'circle', color: color, size: size });

    var p = VT.Rand.pos({ size: size, area: 'full' });
    el.style.position = 'absolute';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    ctx.stage.appendChild(el);

    var path = (ctx.settings.motion === 'wander') ? 'random' : VT.Rand.pick(['lineH', 'lineV']);
    var speed = SPEED_PX[ctx.settings.speed];
    var ctrl = VT.Motion.move(el, { path: path, speed: speed, area: 'full' });

    ctx.addTarget(el, { ctrl: ctrl });
  }

  /** 演出の再生猶予後に要素をDOMから除去する予約を積む(実装メモ1)。 */
  function scheduleCleanup(ctx, el, ms) {
    ctx.data.cleanupQueue.push({ el: el, ms: ms });
  }

  VT.createApp({
    meta: { id: 'c03-balloon-pop', title: 'ふうせんパン' },

    // 設定スキーマ(spec-c03.md §2。このまま実装)
    settings: {
      size: {
        type: 'choice', label: 'おおきさ', default: 'l',
        options: [
          { value: 'xl', label: '特大' }, { value: 'l', label: '大' },
          { value: 'm', label: '中' }, { value: 's', label: '小' }
        ]
      },
      speed: {
        type: 'choice', label: 'はやさ', default: 'normal',
        options: [
          { value: 'slow', label: 'ゆっくり' }, { value: 'normal', label: 'ふつう' }, { value: 'fast', label: 'はやい' }
        ]
      },
      motion: {
        type: 'choice', label: 'うごきかた', default: 'straight',
        options: [
          { value: 'straight', label: 'まっすぐ' }, { value: 'wander', label: 'ふらふら' }
        ]
      },
      count: { type: 'range', label: 'どうじに出る かず', min: 1, max: 3, step: 1, default: 1 },
      duration: {
        type: 'choice', label: '時間', default: '60s',
        options: [
          { value: '30s', label: '30秒' }, { value: '60s', label: '1分' }, { value: '90s', label: '1分30秒' }
        ]
      }
    },

    // 記録スキーマ(spec-c03.md §3)
    record: {
      primary: { key: 'hits', label: 'われた かず', betterIs: 'higher' },
      extras: [
        { key: 'hitRate', label: '命中率', unit: '%' }
      ]
    },

    // 空振りタッチ検出のため(spec-c03.md §4-1)
    stageTouch: true,

    onStart: function (ctx) {
      ctx.data.misses = 0;
      ctx.data.pendingSpawns = [];
      ctx.data.cleanupQueue = [];

      spawnOne(ctx); // 1体目は即時(実装メモ2)
      var count = ctx.settings.count;
      for (var i = 1; i < count; i++) {
        ctx.data.pendingSpawns.push(i * INITIAL_STAGGER_MS);
      }
    },

    onTick: function (ctx) {
      var i;

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
      if (!target) {
        // 空振りタッチ時: 視覚・聴覚とも一切の反応を出さず、内部カウントのみ(spec-c03.md §4-1)
        ctx.data.misses += 1;
        return;
      }

      target.data.ctrl.stop();
      ctx.score += 1;
      ctx.feedback.success(target.el);
      ctx.removeTarget(target.el);
      scheduleCleanup(ctx, target.el, POP_CLEANUP_MS);

      spawnOne(ctx); // 即座に1個補充(spec-c03.md §4-1ヒット時手順3)
    },

    onFinish: function (ctx) {
      var hits = ctx.score;
      var misses = ctx.data.misses;
      var total = hits + misses;
      var hitRate = total > 0 ? Math.round((hits / total) * 100) : 0;
      return { hits: hits, hitRate: hitRate };
    }

    // onAbort: 不要(風船要素はcoreのシーン破棄で消えるため。spec-c03.md §4-3)
  });
})();
