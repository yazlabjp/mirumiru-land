/**
 * vt-input.js — 入力ユーティリティ(Pointer Events実装)(vt-api.md §5 / ai-notes.md §5)
 *
 * touchstart/mousedown併用の二重発火実装は書かない(Pointer Eventsのみ)。
 * ハンドラに渡るイベントは { x, y, pointerId, timeStamp, el }(x,yはステージ座標)。
 * 反応時間の計測は evt.timeStamp を使う(Date.now()は使わない)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-input.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Input) {
    return; // 二重読み込み防止
  }

  var Input = {};

  function getStageRect() {
    var stageEl = document.getElementById('stage');
    if (stageEl && typeof stageEl.getBoundingClientRect === 'function') {
      return stageEl.getBoundingClientRect();
    }
    return { left: 0, top: 0, width: (window.innerWidth || 0), height: (window.innerHeight || 0) };
  }

  /** PointerEventからハンドラ向けのデータ{ x, y, pointerId, timeStamp, el }を作る(座標はステージ相対)。 */
  function toEventData(evt, el, clampToStage) {
    var rect = getStageRect();
    var x = evt.clientX - rect.left;
    var y = evt.clientY - rect.top;
    if (clampToStage) {
      x = VT._util.clamp(x, 0, rect.width);
      y = VT._util.clamp(y, 0, rect.height);
    }
    return { x: x, y: y, pointerId: evt.pointerId, timeStamp: evt.timeStamp, el: el };
  }

  // ============================================================
  // VT.Input.tap — pointerdown基準のタップ。同一要素デバウンス付き(vt-api.md §5)
  // ============================================================
  Input.tap = function (el, handler, opts) {
    opts = opts || {};
    var debounceMs = (opts.debounce === undefined) ? 300 : opts.debounce;
    var lastTime = -Infinity;

    el.addEventListener('pointerdown', function (evt) {
      var now = evt.timeStamp;
      // 同一ターゲット(この要素)に対する300ms以内の再タッチのみ無効化(ai-notes.md §5)。
      // 別要素・別pointerIdはそれぞれ自分のtapバインディングを持つため影響しない。
      if (now - lastTime < debounceMs) return;
      lastTime = now;
      handler(toEventData(evt, el, false));
    });
  };

  // ============================================================
  // VT.Input.drag — ドラッグ追跡(pointerIdで識別・マルチタッチ安全)(vt-api.md §5)
  // ============================================================
  Input.drag = function (el, handlers, opts) {
    handlers = handlers || {};
    opts = opts || {};
    var clampToStage = (opts.clampToStage !== false);
    var activePointerId = null;

    el.addEventListener('pointerdown', function (evt) {
      if (activePointerId !== null) return; // 既に別指でドラッグ中はこの要素上の新規ドラッグを無視
      activePointerId = evt.pointerId;
      if (typeof el.setPointerCapture === 'function') {
        try { el.setPointerCapture(evt.pointerId); } catch (e) { /* no-op */ }
      }
      if (handlers.onStart) handlers.onStart(toEventData(evt, el, clampToStage));
    });

    el.addEventListener('pointermove', function (evt) {
      if (evt.pointerId !== activePointerId) return;
      if (handlers.onMove) handlers.onMove(toEventData(evt, el, clampToStage));
    });

    function endDrag(evt) {
      if (evt.pointerId !== activePointerId) return;
      activePointerId = null;
      if (handlers.onEnd) handlers.onEnd(toEventData(evt, el, clampToStage));
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  };

  // ============================================================
  // VT.Input.hold — 長押し検出(移動tolerance px超で解除)(vt-api.md §5)
  // 先生モードの長押し判定: 1000ms・移動許容10px(ai-notes.md §5)がデフォルト
  // ============================================================
  Input.hold = function (el, opts, onComplete) {
    opts = opts || {};
    var ms = (opts.ms === undefined) ? 1000 : opts.ms;
    var tolerance = (opts.tolerance === undefined) ? 10 : opts.tolerance;

    var timer = null;
    var pointerId = null;
    var startClientX = 0;
    var startClientY = 0;

    function clear(evt) {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (pointerId !== null && evt && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch (e) { /* no-op */ }
      }
      pointerId = null;
    }

    el.addEventListener('pointerdown', function (evt) {
      if (pointerId !== null) return;
      pointerId = evt.pointerId;
      startClientX = evt.clientX;
      startClientY = evt.clientY;
      // ポインタキャプチャ: 押さえている間に指/マウスが要素の外へわずかに出ても
      // pointermove/pointerup を確実にこの要素へ届ける(捕捉なしだと外に出た瞬間に
      // イベントが届かなくなり、pointerIdが内部に残ったまま次回以降反応しなくなる)。
      if (typeof el.setPointerCapture === 'function') {
        try { el.setPointerCapture(evt.pointerId); } catch (e) { /* no-op */ }
      }
      timer = setTimeout(function () {
        var data = toEventData(evt, el, false);
        clear(evt);
        if (onComplete) onComplete(data);
      }, ms);
    });

    el.addEventListener('pointermove', function (evt) {
      if (evt.pointerId !== pointerId) return;
      var dx = evt.clientX - startClientX;
      var dy = evt.clientY - startClientY;
      if (Math.sqrt(dx * dx + dy * dy) > tolerance) clear(evt); // 移動しすぎたら長押し解除
    });

    function release(evt) {
      if (evt.pointerId === pointerId) clear(evt);
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  };

  // ============================================================
  // VT.Input.press — 押下・離しの生検出(HoldGuard=「押さえ続ける」判定用)(vt-api.md §5)
  // ============================================================
  Input.press = function (el, handlers) {
    handlers = handlers || {};
    var pointerId = null;

    el.addEventListener('pointerdown', function (evt) {
      if (pointerId !== null) return;
      pointerId = evt.pointerId;
      if (handlers.onDown) handlers.onDown(toEventData(evt, el, false));
    });

    function up(evt) {
      if (evt.pointerId !== pointerId) return;
      pointerId = null;
      if (handlers.onUp) handlers.onUp(toEventData(evt, el, false));
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  VT.Input = Input;

  // ============================================================
  // グローバルな入力挙動の抑止(ai-notes.md §5): 長押しメニュー・ピンチ拡大の抑止
  // touch-action / tap-highlight-color / user-select はCSS側(base.css)で設定する。
  // ============================================================
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }
})();
