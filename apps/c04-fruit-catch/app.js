/**
 * app.js — C-04 キャッチだいさくせん(docs/specs/c04.md 準拠)
 *
 * 根拠: docs/vt-api.md(API正) + docs/ai-notes.md(実装規約) + docs/specs/c04.md(本アプリ仕様)。
 *
 * 実装メモ(仕様の曖昧箇所の解決・実装AIへの申し送り):
 * 1. spec-c04.md §4-1の指示どおり、本アプリはctx.addTarget/onTouchを使わない。カゴは
 *    VT.Input.dragで直接ドラッグ制御し、果物はonTick内でctx.dtを積算して自前でy座標を
 *    進める(VT.Motion.moveは往復パス用のため使わない)。カゴの見た目はVT.Stim.shapeに
 *    該当形状が無いため、app.js内でSVG要素を直接組み立てる(vt-api.mdに存在しないVT関数を
 *    呼ぶわけではなく装飾要素の静的マークアップを自作するのみのため、ai-notes §0-4には抵触しない。
 *    spec-c04.md §4-1に明記された前提)。
 * 2. onTick内でキャッチ/取りこぼしが起きた果物をその場でspawnFruit()し直すと、置き換え先の
 *    新しい果物が同一ループのfruits配列に追加され、同一フレーム内で二重にdtが加算される
 *    (ループがまだ進行中の末尾要素として再訪される)おそれがある。これを避けるため、
 *    ループ内では消えた果物の補充「数」だけを数え、ループを抜けてから補充する
 *    (spec-c04.md §4-1出現規則3「即座に1個補充」自体の意味は変えていない。1フレーム未満の
 *    遅延)。
 * 3. 出現規則1「中心間距離が120px未満なら再抽選」の中心間距離は、すべての果物が同じ
 *    FRUIT_SIZEを持つため、要素の左上座標(x, y)同士のユークリッド距離で代用できる
 *    (定数オフセットが相殺されるため)。
 * 4. 実機テストで、count>=2のときゲーム開始直後のcount個が同じy(-120)・同じタイミングで
 *    生成され、x座標こそ重ならないものの同じ高さ・同じ速度でカゴの位置まで到達するため、
 *    カゴを動かして全部を取りきるのが実質不可能に近い難易度になることが判明した。spec-c04.md
 *    §4-1出現規則1〜3自体(「常にcount個が同時に落下し続ける」)の意図は変えず、ゲーム開始時
 *    (onStart)の初回出現のみ生成タイミングをずらす。キャッチ・取りこぼし後の即時1個補充
 *    (出現規則3)は既存の果物がすでに時間差で稼働しているため変更不要(c03-balloon-popの
 *    同種の問題への対処と同じ設計。ctx.data.pendingSpawnsをonTick内でctx.dt積算により消化
 *    する。setTimeoutは使わない)。
 * 5. 実装メモ4の初回ずらし量は、当初「固定400ms間隔」で実装したが実機再テストで視覚的な
 *    分離がほぼ感じられなかった。原因は、見た目の分離は経過時間ではなくピクセル間隔
 *    (speed × 経過時間)で決まるため、fallSpeedが遅いほど同じms差が小さいpx差にしかならず、
 *    数秒がかりの落下の中では誤差程度にしか見えないことだった。そこで固定ms間隔ではなく、
 *    fallSpeedに関わらず一定のピクセル間隔(INITIAL_STAGGER_GAP_PX=180px、果物直径の1.5倍)を
 *    確保するようms間隔をその場のspeed(FALL_SPEED_PXの実値)から逆算する方式に変更した
 *    (speedが速いほどms間隔は短くなり、遅いほど長くなる。FALL_SPEED_PXの実値を変更しても
 *    この計算式は自動的に整合する)。
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var FRUIT_SIZE = 120; // 果物の直径120px固定(spec-c04.md §2)
  var BASKET_HEIGHT = 70; // カゴの高さ70px固定(spec-c04.md §2)
  var BASKET_TOP_OFFSET = 110; // カゴ上端 = ctx.rect().h - 110(spec-c04.md §4-1)
  var CATCH_MARGIN = 60; // キャッチ判定のx方向の余白(spec-c04.md §4-1)
  var MIN_SPAWN_GAP = 120; // 既存の落下中果物との最小中心間距離(spec-c04.md §4-1出現規則1)
  var MAX_SPAWN_ATTEMPTS = 20; // 再抽選の上限(無限ループ禁止)
  var EDGE_MARGIN = 24; // 出現位置のステージ端マージン(ai-notes.md §2)
  var INITIAL_STAGGER_GAP_PX = 180; // ゲーム開始時の初回出現のみ確保する見た目上のピクセル間隔(実装メモ4・5)

  var FALL_SPEED_PX = { slow: 60, normal: 120, fast: 200 }; // spec-c04.md §2数値対応表(px/秒)
  var BASKET_WIDTH_PX = { xl: 320, l: 260, m: 200, s: 150 }; // spec-c04.md §2数値対応表

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    return e;
  }

  function clamp(v, min, max) {
    if (min > max) return min;
    return Math.min(Math.max(v, min), max);
  }

  /** カゴのSVGを自作で組み立てる(VT.Stim.shapeに該当形状が無いため。spec-c04.md §4-1実装メモ1)。 */
  function buildBasketEl(widthPx) {
    var svg = svgEl('svg', {
      viewBox: '0 0 200 70', width: widthPx, height: BASKET_HEIGHT,
      preserveAspectRatio: 'none', 'class': 'vt-c04-basket'
    });
    svg.appendChild(svgEl('path', { d: 'M14 18 L186 18 L166 66 L34 66 Z', fill: 'var(--stim-brown)' }));
    svg.appendChild(svgEl('path', {
      d: 'M30 34 L170 34 M40 50 L160 50',
      fill: 'none', stroke: 'var(--bg)', 'stroke-width': 3, opacity: 0.5
    }));
    svg.appendChild(svgEl('rect', { x: 6, y: 4, width: 188, height: 18, rx: 9, fill: 'var(--stim-orange)' }));
    return svg;
  }

  /** 2つの果物(左上座標)の中心間距離(実装メモ3。同一FRUIT_SIZEのためオフセットが相殺される)。 */
  function centerDist(x1, y1, x2, y2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 果物を1個生成しctx.stageへ追加する。ctx.data.fruitsは呼び出し側が更新する(spec-c04.md §4-1出現規則1〜2)。 */
  function spawnFruit(ctx) {
    var stageW = ctx.rect().w;
    var minX = EDGE_MARGIN;
    var maxX = stageW - EDGE_MARGIN - FRUIT_SIZE;
    var x = minX;
    for (var i = 0; i < MAX_SPAWN_ATTEMPTS; i++) {
      x = VT.Rand.int(minX, maxX);
      var overlaps = ctx.data.fruits.some(function (f) {
        return centerDist(x, -FRUIT_SIZE, f.x, f.y) < MIN_SPAWN_GAP;
      });
      if (!overlaps) break;
    }

    var picked = VT.Stim.random('fruits', {});
    var el = picked.el;
    el.style.position = 'absolute';
    el.style.left = x + 'px';
    el.style.top = -FRUIT_SIZE + 'px';
    ctx.stage.appendChild(el);

    return { el: el, x: x, y: -FRUIT_SIZE, speed: FALL_SPEED_PX[ctx.settings.fallSpeed] };
  }

  VT.createApp({
    meta: { id: 'c04-fruit-catch', title: 'キャッチだいさくせん' },

    // 設定スキーマ(spec-c04.md §2。このまま実装)
    settings: {
      fallSpeed: {
        type: 'choice', label: 'おちる はやさ', default: 'slow',
        options: [
          { value: 'slow', label: 'ゆっくり' }, { value: 'normal', label: 'ふつう' }, { value: 'fast', label: 'はやい' }
        ]
      },
      basketWidth: {
        type: 'choice', label: 'カゴの はば', default: 'xl',
        options: [
          { value: 'xl', label: 'とても ひろい' }, { value: 'l', label: 'ひろい' },
          { value: 'm', label: 'ふつう' }, { value: 's', label: 'せまい' }
        ]
      },
      count: { type: 'range', label: 'どうじに おちる かず', min: 1, max: 3, step: 1, default: 1 },
      duration: {
        type: 'choice', label: '時間', default: '60s',
        options: [
          { value: '30s', label: '30秒' }, { value: '60s', label: '1分' }, { value: '90s', label: '1分30秒' }
        ]
      }
    },

    // 記録スキーマ(spec-c04.md §3)
    record: {
      primary: { key: 'catches', label: 'キャッチできた かず', betterIs: 'higher' },
      extras: [
        { key: 'catchRate', label: 'キャッチ率', unit: '%' }
      ]
    },

    onStart: function (ctx) {
      var basketWidthPx = BASKET_WIDTH_PX[ctx.settings.basketWidth];
      var stageRect = ctx.rect();

      ctx.data.misses = 0;
      ctx.data.fruits = [];
      ctx.data.basketWidthPx = basketWidthPx;
      ctx.data.basketTop = stageRect.h - BASKET_TOP_OFFSET;
      ctx.data.basketX = (stageRect.w - basketWidthPx) / 2;

      var basketEl = buildBasketEl(basketWidthPx);
      basketEl.style.position = 'absolute';
      basketEl.style.left = ctx.data.basketX + 'px';
      basketEl.style.top = ctx.data.basketTop + 'px';
      ctx.stage.appendChild(basketEl);

      VT.Input.drag(basketEl, {
        onMove: function (evt) {
          var stageW = ctx.rect().w;
          var newX = clamp(evt.x - basketWidthPx / 2, 0, stageW - basketWidthPx);
          ctx.data.basketX = newX;
          basketEl.style.left = newX + 'px';
        }
      }, { clampToStage: true });

      ctx.data.pendingSpawns = [];
      ctx.data.fruits.push(spawnFruit(ctx)); // 1個目は即座に出現(実装メモ4)
      var count = ctx.settings.count;
      var speedPx = FALL_SPEED_PX[ctx.settings.fallSpeed];
      var staggerMs = (INITIAL_STAGGER_GAP_PX / speedPx) * 1000; // speedに関わらず一定のpx間隔になるms値(実装メモ5)
      for (var i = 1; i < count; i++) {
        ctx.data.pendingSpawns.push(i * staggerMs);
      }
    },

    onTick: function (ctx) {
      var basketTop = ctx.data.basketTop;
      var basketWidthPx = ctx.data.basketWidthPx;
      var stageH = ctx.rect().h;
      var i;

      // ゲーム開始時の初回出現の残り分を、ずらしながら出現させる(実装メモ4)。この時点で
      // 生成した果物は、今フレームのdtを二重適用しないよう下の落下ループの対象外にする
      // (実装メモ2と同じ理由)。
      var pending = ctx.data.pendingSpawns;
      var stillWaiting = [];
      var newlySpawned = [];
      for (i = 0; i < pending.length; i++) {
        var remainingMs = pending[i] - ctx.dt;
        if (remainingMs <= 0) {
          newlySpawned.push(spawnFruit(ctx));
        } else {
          stillWaiting.push(remainingMs);
        }
      }
      ctx.data.pendingSpawns = stillWaiting;

      var fruits = ctx.data.fruits;
      var remaining = [];
      var toSpawn = 0;

      for (i = 0; i < fruits.length; i++) {
        var f = fruits[i];
        f.y += f.speed * ctx.dt / 1000;
        f.el.style.top = f.y + 'px';

        var centerX = f.x + FRUIT_SIZE / 2;
        var centerY = f.y + FRUIT_SIZE / 2;

        if (centerY >= basketTop && centerX >= ctx.data.basketX - CATCH_MARGIN && centerX <= ctx.data.basketX + basketWidthPx + CATCH_MARGIN) {
          // キャッチ成立(spec-c04.md §4-1手順2)
          ctx.score += 1;
          ctx.feedback.success(f.el);
          f.el.remove();
          toSpawn += 1;
          continue;
        }

        if (centerY > stageH) {
          // 取りこぼし: 視覚・聴覚とも一切の反応を出さず内部カウントのみ(spec-c04.md §4-1手順3)
          ctx.data.misses += 1;
          f.el.remove();
          toSpawn += 1;
          continue;
        }

        remaining.push(f);
      }

      ctx.data.fruits = remaining.concat(newlySpawned);
      for (i = 0; i < toSpawn; i++) {
        ctx.data.fruits.push(spawnFruit(ctx)); // 実装メモ2: ループを抜けてから補充する
      }
    },

    onFinish: function (ctx) {
      var catches = ctx.score;
      var misses = ctx.data.misses;
      var total = catches + misses;
      var catchRate = total > 0 ? Math.round((catches / total) * 100) : 0;
      return { catches: catches, catchRate: catchRate };
    }

    // onAbort: 不要(カゴ・果物要素はcoreのシーン破棄で消えるため。spec-c04.md §4-3)
  });
})();
