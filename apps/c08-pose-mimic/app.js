/**
 * app.js — C-08 まねっこポーズ(docs/specs/c08.md 準拠)
 *
 * 根拠: docs/vt-api.md(API正) + docs/ai-notes.md(実装規約) + docs/specs/c08.md(本アプリ仕様)。
 *
 * 実装メモ(仕様の曖昧箇所の解決・実装AIへの申し送り):
 * 1. spec-c08.md §5-1の指示どおり、stageTouchは使わずctx.addTargetを確認ボタン1個だけに
 *    アタッチする。ポーズの絵・ステージ余白は最初からonTouchの対象にならないため、
 *    誤タッチの無反応化(個別DoD8)はifガード不要でAPIの構造だけで保証される。
 * 2. 確認ボタンが押されてからポーズ・ボタンを消して次ラウンドへ進むまでの750ms
 *    (spec §5-1手順3。spec-c02.md §4-1のHIT_CLEANUP_MSに準拠)はsetTimeoutを使わず
 *    onTick内でctx.dtを積算するpendingAdvanceで管理する(ai-notes.md §1)。この間は
 *    showTimeのタイムアウト判定を止める(ctx.data.showLimitMs=nullにする)必要がある。
 *    ボタンを押した時点ですでにそのラウンドは「できた」で確定しており、演出待ちの間に
 *    showTimeが満了しても意味を持たないため。
 * 3. ポーズは5種とも自作の単純な棒人間SVGで表現する(vt-api.mdにポーズ用の絵柄テーマは
 *    存在しないため。ai-notes §0-4)。色はcurrentColorとし、#stageのdata-contrast切り替えに
 *    連動させる(vt-scene.jsの歯車アイコンと同じ手法)。
 * 4. ひらがなキャプション(spec-c08.md §5-1)はcolor:inheritのプレーンdivとし、#stageの
 *    color(data-contrast切り替え)をそのまま継承させる。ポーズ枠の高さ(pos.h)からCAPTION_HEIGHT
 *    を差し引いた残りを絵のSVG高さにし、レイアウト枠全体(水平中央配置・ボタンとの間隔)は
 *    従来のまま変えない(spec-c08.md §5-1)。
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // 数値対応表(規範。spec-c08.md §2・§5-1)
  var SHOW_TIME_MS = { free: null, '20s': 20000, '15s': 15000, '10s': 10000 };
  var TOTAL_ROUNDS = { n5: 5, n8: 8, n12: 12 };

  var BUTTON_SIZE = 180; // 確認ボタンの直径(spec-c08.md §5-1。120px以上の規約を満たす)
  var BUTTON_BOTTOM_MARGIN = 40;
  var POSE_AREA_TOP_MARGIN = 24;
  var POSE_SINGLE = { w: 220, h: 320 };
  var POSE_DOUBLE = { w: 170, h: 260, gap: 40 };
  var CAPTION_HEIGHT = 36; // ポーズ枠下端に確保するひらがなキャプション欄(spec-c08.md §5-1。全ラベル1行に収まる高さ)
  var CAPTION_FONT_PX = 24; // developer-guide.md §3の児童生徒向け文字最小規定
  var RESOLVE_DELAY_MS = 750; // 成功演出の再生猶予(spec-c08.md §5-1手順3)

  // ポーズ5種(規範。spec-c08.md §3)。viewBox "0 0 200 300" 基準の棒人間。
  // headは円・胴体/腕/脚は1本のpathにまとめる。実機確認で「見分けがつきにくい」との
  // 指摘を受け、角度・幅・頭の高さを誇張している(2026-07-24デフォルメ強化)。さらに
  // hizapon/shagamuが「やっぱり見分けづらい」との指摘を受け、片足立ち2種(migi/hidari)に
  // 差し替えた(2026-07-24再々設計)。mirror無効果の根拠は向きに機能的な意味がないことで
  // あり対称性そのものではない(spec-c08.md §2)。migi/hidariは向きに意味を持つ唯一の例外だが、
  // キャプション(呼び名)と絵を常に一致させるため、mirrorでは絵を入れ替えない(§2参照)。
  var POSES = {
    // 肩の高さで厳密に水平(dy=0)、画面幅いっぱいまで広げてTの字のシルエットを最大化する。
    // 脚は他ポーズより閉じた「気をつけ」立ちにして、腕の横幅だけが際立つようにする。
    yoko: {
      head: { cx: 100, cy: 54, r: 26 },
      path: 'M100 100 L15 100 M100 100 L185 100 M100 80 L100 190 M100 190 L88 280 M100 190 L112 280'
    },
    // 腕は肩(100,100)から収束するタワーV字で頭上へ伸ばし、指先に点を置いて強調する。
    // 脚は標準の自然な開き(yokoと同じ)にとどめ、腕の形だけで識別させる。
    banzai: {
      head: { cx: 100, cy: 54, r: 26 },
      path: 'M100 100 L65 20 M100 100 L135 20 M100 80 L100 190 M100 190 L75 280 M100 190 L125 280',
      hands: [{ cx: 65, cy: 20, r: 9 }, { cx: 135, cy: 20, r: 9 }]
    },
    // 腕を体に沿わせて下ろす唯一のポーズ(腕が上がる/横に伸びる他4種と混同しない)。
    // 脚はyokoと同じ「気をつけ」立ち。腕と胴体が視覚的に癒着しないよう、下ろした腕でも
    // 胴体から分離して見える幅を確保する(実機確認時に胴体と重なって見えた反省。2026-07-24)。
    kiwotsuke: {
      head: { cx: 100, cy: 54, r: 26 },
      path: 'M100 80 L100 190 M100 100 L68 195 M100 100 L132 195 M100 190 L88 280 M100 190 L112 280'
    },
    // 画面むかって右の脚をまっすぐ立て、左の脚を曲げて引き寄せる片足立ち(フラミンゴ立ち)。
    // 「画面の右側で立っている脚=みぎあし」という単純な対応で描く(視覚的にそのまま真似れば
    // よい設計。B-05のような「じぶんのみぎ/がめんのみぎ」の視点切り替えは扱わない。§7参照)。
    // 腕は体幹からわずかに離してバランスを取る構えにし、kiwotsuke(腕を体に沿わせる)と
    // 区別する。左右の脚が非対称なシルエット自体が、他4種(脚は左右対称)との識別点になる。
    migi: {
      head: { cx: 100, cy: 54, r: 26 },
      path: 'M100 80 L100 190 M100 100 L70 140 M100 100 L130 140 M100 190 L115 280 M100 190 L65 215 L100 225'
    },
    // migiの左右反転版(脚のみ)。画面むかって左の脚で立ち、右の脚を曲げて引き寄せる。
    // mirror設定では入れ替えない(呼び名キャプションと絵の対応を常に保つため。spec-c08.md §2)。
    hidari: {
      head: { cx: 100, cy: 54, r: 26 },
      path: 'M100 80 L100 190 M100 100 L70 140 M100 100 L130 140 M100 190 L85 280 M100 190 L135 215 L100 225'
    }
  };
  var POSE_IDS = Object.keys(POSES);
  var POSE_LABELS = {
    yoko: 'りょうてよこ', banzai: 'ばんざい', kiwotsuke: 'きをつけ',
    migi: 'みぎでたつ', hidari: 'ひだりでたつ'
  };

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    return e;
  }

  /** ポーズの絵を1個作る(自作SVG。spec-c08.md §3・§5-1実装メモ3)。 */
  function buildPoseEl(poseId, w, h) {
    var def = POSES[poseId];
    var svg = svgEl('svg', { viewBox: '0 0 200 300', width: w, height: h, 'class': 'vt-c08-pose' });
    svg.appendChild(svgEl('circle', { cx: def.head.cx, cy: def.head.cy, r: def.head.r, fill: 'currentColor' }));
    svg.appendChild(svgEl('path', {
      d: def.path, fill: 'none', stroke: 'currentColor',
      'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    (def.hands || []).forEach(function (h2) {
      svg.appendChild(svgEl('circle', { cx: h2.cx, cy: h2.cy, r: h2.r, fill: 'currentColor' }));
    });
    return svg;
  }

  /** 確認ボタン(教員がタッチする「できた!」ボタン。spec-c08.md §5-1)。VT.Stimに該当が無いため自作。 */
  function buildButtonEl(size) {
    var el = document.createElement('div');
    el.className = 'vt-c08-btn';
    el.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'background:var(--stim-green);color:#FFFFFF;font-size:28px;font-weight:bold;' +
      'box-shadow:0 4px 10px var(--ui-shadow);';
    el.textContent = 'できた!';
    return el;
  }

  /** ポーズ名のひらがなキャプション(spec-c08.md §5-1)。#stageのcolor(contrast切替)を継承する。 */
  function buildCaptionEl(poseId, w) {
    var el = document.createElement('div');
    el.className = 'vt-c08-caption';
    el.style.cssText = 'position:absolute;width:' + w + 'px;height:' + CAPTION_HEIGHT + 'px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:' + CAPTION_FONT_PX + 'px;color:inherit;text-align:center;';
    el.textContent = POSE_LABELS[poseId];
    return el;
  }

  /** ポーズ表示領域(ボタン領域より上)内で、count個のポーズを水平中央寄せで配置する(spec-c08.md §5-1レイアウト)。 */
  function computePoseLayout(rect, buttonTopY, count) {
    var areaHeight = buttonTopY - POSE_AREA_TOP_MARGIN;
    if (count === 1) {
      var w = POSE_SINGLE.w, h = POSE_SINGLE.h;
      return [{ x: (rect.w - w) / 2, y: POSE_AREA_TOP_MARGIN + (areaHeight - h) / 2, w: w, h: h }];
    }
    var w2 = POSE_DOUBLE.w, h2 = POSE_DOUBLE.h, gap = POSE_DOUBLE.gap;
    var startX = (rect.w - (w2 * 2 + gap)) / 2;
    var y2 = POSE_AREA_TOP_MARGIN + (areaHeight - h2) / 2;
    return [
      { x: startX, y: y2, w: w2, h: h2 },
      { x: startX + w2 + gap, y: y2, w: w2, h: h2 }
    ];
  }

  function samePoseSet(a, b) {
    if (a.length !== b.length) return false;
    return a.every(function (id) { return b.indexOf(id) !== -1; });
  }

  /** 直前ラウンドと同じポーズ(の組)にならないよう選ぶ(spec-c08.md §5-1手順1。ai-notes §2と同趣旨)。 */
  function pickPoseIds(ctx, count) {
    var prev = ctx.data.prevPoseIds;
    var picked = [];
    for (var attempt = 0; attempt < 20; attempt++) {
      picked = VT.Rand.shuffle(POSE_IDS).slice(0, count);
      if (!samePoseSet(picked, prev)) break;
    }
    return picked;
  }

  /** 現在のポーズ・ボタン要素をDOMから除去する。 */
  function clearRoundEls(ctx) {
    ctx.data.currentPoseEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    var btn = ctx.data.currentButtonEl;
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    ctx.data.currentPoseEls = [];
    ctx.data.currentButtonEl = null;
  }

  /** shownがtotalRoundsに達していれば終了、そうでなければ次ラウンドを開始する(spec-c08.md §5-1手順3)。 */
  function advanceOrFinish(ctx) {
    if (ctx.data.shown >= ctx.data.totalRounds) {
      ctx.end();
    } else {
      spawnRound(ctx);
    }
  }

  /** 1ラウンド分(ポーズcount個+確認ボタン)を出現させる(spec-c08.md §5-1「ラウンド開始」)。 */
  function spawnRound(ctx) {
    var count = ctx.settings.twoPoses ? 2 : 1;
    var poseIds = pickPoseIds(ctx, count);
    ctx.data.prevPoseIds = poseIds;

    var rect = ctx.rect();
    var buttonTopY = rect.h - BUTTON_SIZE - BUTTON_BOTTOM_MARGIN;
    var layout = computePoseLayout(rect, buttonTopY, count);

    // ポーズ枠(pos.h)の下端CAPTION_HEIGHT分をキャプションに充て、絵自体はその残りに収める
    // (spec-c08.md §5-1「ひらがなキャプション」)。
    var poseEls = [];
    poseIds.forEach(function (id, i) {
      var pos = layout[i];
      var svgH = pos.h - CAPTION_HEIGHT;

      var el = buildPoseEl(id, pos.w, svgH);
      el.style.position = 'absolute';
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      ctx.stage.appendChild(el);
      poseEls.push(el);

      var caption = buildCaptionEl(id, pos.w);
      caption.style.left = pos.x + 'px';
      caption.style.top = (pos.y + svgH) + 'px';
      ctx.stage.appendChild(caption);
      poseEls.push(caption);
    });

    var buttonEl = buildButtonEl(BUTTON_SIZE);
    buttonEl.style.left = ((rect.w - BUTTON_SIZE) / 2) + 'px';
    buttonEl.style.top = buttonTopY + 'px';
    ctx.stage.appendChild(buttonEl);
    ctx.addTarget(buttonEl);

    ctx.data.currentPoseEls = poseEls;
    ctx.data.currentButtonEl = buttonEl;
    ctx.data.shown += 1;
    ctx.data.showLimitMs = SHOW_TIME_MS[ctx.settings.showTime];
    ctx.data.showElapsed = 0;
  }

  VT.createApp({
    meta: { id: 'c08-pose-mimic', title: 'まねっこポーズ' },

    // 設定スキーマ(spec-c08.md §2。このまま実装)
    settings: {
      showTime: {
        type: 'choice', label: 'まつ じかん', default: 'free',
        options: [
          { value: 'free', label: 'せいげんなし' }, { value: '20s', label: '20びょう' },
          { value: '15s', label: '15びょう' }, { value: '10s', label: '10びょう' }
        ]
      },
      twoPoses: { type: 'toggle', label: '2つ れんぞく', default: false },
      poseCount: {
        type: 'choice', label: 'かいすう', default: 'n5',
        options: [
          { value: 'n5', label: '5かい' }, { value: 'n8', label: '8かい' }, { value: 'n12', label: '12かい' }
        ]
      }
    },

    // 記録スキーマ(spec-c08.md §4)
    record: {
      primary: { key: 'completed', label: 'できた かいすう', betterIs: 'higher' },
      extras: [
        { key: 'shown', label: 'だした かいすう', unit: 'かい' }
      ]
    },

    // stageTouch: 使わない(既定false)。ボタン以外は最初からonTouchの対象にならない(spec-c08.md §5-1)。

    onStart: function (ctx) {
      ctx.data.shown = 0;
      ctx.data.prevPoseIds = [];
      ctx.data.currentPoseEls = [];
      ctx.data.currentButtonEl = null;
      ctx.data.pendingAdvance = null;
      ctx.data.totalRounds = TOTAL_ROUNDS[ctx.settings.poseCount];
      spawnRound(ctx);
    },

    onTick: function (ctx) {
      if (ctx.data.pendingAdvance) {
        ctx.data.pendingAdvance.ms -= ctx.dt;
        if (ctx.data.pendingAdvance.ms <= 0) {
          ctx.data.pendingAdvance = null;
          clearRoundEls(ctx);
          advanceOrFinish(ctx);
        }
        return;
      }

      if (ctx.data.showLimitMs !== null) {
        ctx.data.showElapsed += ctx.dt;
        if (ctx.data.showElapsed >= ctx.data.showLimitMs) {
          // showTime満了: 視覚・聴覚とも一切の反応を出さず静かに次へ進む(spec-c08.md §5-1・原則3)
          ctx.removeTarget(ctx.data.currentButtonEl);
          clearRoundEls(ctx);
          advanceOrFinish(ctx);
        }
      }
    },

    onTouch: function (ctx, target) {
      if (!target) return; // stageTouchを使わないため理論上到達しない(spec-c08.md §5-1実装方式の前提)

      ctx.removeTarget(target.el); // 実装メモ2: 連打による二重加算を防ぐため即座に対象から外す
      ctx.score += 1; // completed
      ctx.feedback.success(target.el);
      ctx.data.showLimitMs = null; // 演出待ち中はshowTimeのタイムアウト判定を止める(実装メモ2)
      ctx.data.pendingAdvance = { ms: RESOLVE_DELAY_MS };
    },

    onFinish: function (ctx) {
      return { completed: ctx.score, shown: ctx.data.shown };
    }

    // onAbort: 不要(ポーズ・ボタン要素はcoreのシーン破棄で消えるため。spec-c08.md §5-3)
  });
})();
