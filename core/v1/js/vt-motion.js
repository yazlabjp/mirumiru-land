/**
 * vt-motion.js — 移動・アニメーション(vt-api.md §9)
 *
 * VT.Motion.move: 連続移動。単一の共有requestAnimationFrameループで全コントローラを駆動する
 * (setInterval/setTimeoutをゲーム進行に使わない。ai-notes.md §1と同じ規範)。
 * 経過msは1フレームあたり上限100msでクランプする。
 *
 * 内部専用: VT._motion(vt-scene.jsがシーンpause/restart時に全moveを一括制御するためのフック)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-motion.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Motion) {
    return; // 二重読み込み防止
  }

  var EDGE_MARGIN = 24; // ai-notes.md §2と同じ端マージン

  function computeArea(area) {
    var stageEl = document.getElementById('stage');
    var rect = (stageEl && typeof stageEl.getBoundingClientRect === 'function')
      ? stageEl.getBoundingClientRect()
      : { width: (window.innerWidth || 0), height: (window.innerHeight || 0) };
    var w = rect.width, h = rect.height;
    var full = { minX: EDGE_MARGIN, maxX: w - EDGE_MARGIN, minY: EDGE_MARGIN, maxY: h - EDGE_MARGIN };

    var b;
    if (area === 'center') {
      b = { minX: w * 0.25, maxX: w * 0.75, minY: h * 0.25, maxY: h * 0.75 };
    } else if (area === 'left') {
      b = { minX: full.minX, maxX: w * 0.5, minY: full.minY, maxY: full.maxY };
    } else if (area === 'right') {
      b = { minX: w * 0.5, maxX: full.maxX, minY: full.minY, maxY: full.maxY };
    } else if (area === 'bottom') {
      b = { minX: full.minX, maxX: full.maxX, minY: h * 0.5, maxY: full.maxY };
    } else {
      b = full; // 'full'(既定)
    }
    if (b.minX > b.maxX) b.maxX = b.minX;
    if (b.minY > b.maxY) b.maxY = b.minY;
    return b;
  }

  // ============================================================
  // 経路(path)の位置関数(単位: 秒からの経過tでの位置)
  // ============================================================
  function triangleWave01(t, period) {
    if (period <= 0) return 0;
    var phase = (t % period) / period;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0→1→0
  }
  function lineHPos(t, speed, b) {
    var width = Math.max(1, b.maxX - b.minX);
    var period = (width * 2) / speed;
    return { x: b.minX + width * triangleWave01(t, period), y: (b.minY + b.maxY) / 2 };
  }
  function lineVPos(t, speed, b) {
    var height = Math.max(1, b.maxY - b.minY);
    var period = (height * 2) / speed;
    return { x: (b.minX + b.maxX) / 2, y: b.minY + height * triangleWave01(t, period) };
  }
  function circlePos(t, speed, b) {
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    var radius = Math.max(1, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 2 * 0.8);
    var angle = t * (speed / radius);
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }
  function eightPos(t, speed, b) {
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    var a = Math.max(1, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 2 * 0.8);
    var angle = t * (speed / a);
    return { x: cx + a * Math.sin(angle), y: cy + a * Math.sin(angle) * Math.cos(angle) };
  }
  function computeClosedFormPos(path, t, speed, b) {
    switch (path) {
      case 'lineH': return lineHPos(t, speed, b);
      case 'lineV': return lineVPos(t, speed, b);
      case 'circle': return circlePos(t, speed, b);
      case 'eight': return eightPos(t, speed, b);
      default: return lineHPos(t, speed, b);
    }
  }
  function randomPoint(b) {
    return {
      x: b.minX + Math.random() * Math.max(0, b.maxX - b.minX),
      y: b.minY + Math.random() * Math.max(0, b.maxY - b.minY)
    };
  }
  function stepToward(current, target, speed, dtSec) {
    var dx = target.x - current.x, dy = target.y - current.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var maxStep = speed * dtSec;
    if (dist <= maxStep || dist === 0) {
      return { pos: { x: target.x, y: target.y }, arrived: true };
    }
    var ratio = maxStep / dist;
    return { pos: { x: current.x + dx * ratio, y: current.y + dy * ratio }, arrived: false };
  }

  // ============================================================
  // 共有駆動ループ(全moveコントローラをまとめて1本のrAFで進める)
  // ============================================================
  var controllers = [];
  var driverRunning = false;
  var driverLastTime = null;

  function driverTick(now) {
    if (driverLastTime === null) driverLastTime = now;
    var dt = now - driverLastTime;
    driverLastTime = now;
    if (dt > 100) dt = 100; // 上限100msでクランプ

    controllers.forEach(function (c) {
      if (!c._paused && !c._stopped) c._step(dt);
    });

    if (controllers.length > 0) {
      window.requestAnimationFrame(driverTick);
    } else {
      driverRunning = false;
      driverLastTime = null;
    }
  }

  function ensureDriver() {
    if (!driverRunning) {
      driverRunning = true;
      driverLastTime = null;
      window.requestAnimationFrame(driverTick);
    }
  }

  function applyPosition(el, pos) {
    if (el && el.style) {
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }
  }

  function createController(el, opts) {
    var path = opts.path || 'lineH';
    var speed = opts.speed || 100;
    var bounds = computeArea(opts.area);
    var elapsedMs = 0;
    var randomTarget = (path === 'random') ? randomPoint(bounds) : null;
    var current = (path === 'random') ? randomTarget : computeClosedFormPos(path, 0, speed, bounds);
    applyPosition(el, current);

    var ctrl = { _paused: false, _stopped: false };

    ctrl._step = function (dtMs) {
      elapsedMs += dtMs;
      if (path === 'random') {
        var res = stepToward(current, randomTarget, speed, dtMs / 1000);
        current = res.pos;
        if (res.arrived) randomTarget = randomPoint(bounds);
      } else {
        current = computeClosedFormPos(path, elapsedMs / 1000, speed, bounds);
      }
      applyPosition(el, current);
    };
    ctrl.pause = function () { ctrl._paused = true; };
    ctrl.resume = function () { ctrl._paused = false; };
    ctrl.stop = function () {
      ctrl._stopped = true;
      var i = controllers.indexOf(ctrl);
      if (i !== -1) controllers.splice(i, 1);
    };
    ctrl.pos = function () { return { x: current.x, y: current.y }; };

    return ctrl;
  }

  var Motion = {};

  /** 連続移動を開始する。戻り値ctrl: {pause(), resume(), stop(), pos()}(vt-api.md §9)。 */
  Motion.move = function (el, opts) {
    opts = opts || {};
    var ctrl = createController(el, opts);
    controllers.push(ctrl);
    ensureDriver();
    return { pause: ctrl.pause, resume: ctrl.resume, stop: ctrl.stop, pos: ctrl.pos };
  };

  // ---- 内部専用: シーンpause/restart時にvt-scene.jsから全moveを一括制御する ----
  VT._motion = {
    pauseAll: function () { controllers.forEach(function (c) { c.pause(); }); },
    resumeAll: function () { controllers.forEach(function (c) { c.resume(); }); },
    stopAll: function () { controllers.slice().forEach(function (c) { c.stop(); }); }
  };

  // ============================================================
  // VT.Motion.tween — 単発補間(vt-api.md §9)
  // ============================================================
  var EASES = {
    linear: function (t) { return t; },
    easeIn: function (t) { return t * t * t; },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); }
  };

  function getCurrentScale(el) {
    return (typeof el.__vtScale === 'number') ? el.__vtScale : 1;
  }
  function setScale(el, v) {
    el.__vtScale = v;
    if (el.style) el.style.transform = 'scale(' + v + ')';
  }
  function readCurrentPropValue(el, key) {
    switch (key) {
      case 'x': return parseFloat(el.style.left) || 0;
      case 'y': return parseFloat(el.style.top) || 0;
      case 'opacity': { var v = parseFloat(el.style.opacity); return isNaN(v) ? 1 : v; }
      case 'scale': return getCurrentScale(el);
      default: return 0;
    }
  }
  function applyPropValue(el, key, v) {
    switch (key) {
      case 'x': el.style.left = v + 'px'; break;
      case 'y': el.style.top = v + 'px'; break;
      case 'opacity': el.style.opacity = String(v); break;
      case 'scale': setScale(el, v); break;
    }
  }

  /** props(x/y/scale/opacity)をms掛けて補間するPromiseを返す。 */
  Motion.tween = function (el, props, ms, ease) {
    var easeFn = EASES[ease] || EASES.easeOut;
    var startProps = {};
    Object.keys(props).forEach(function (k) { startProps[k] = readCurrentPropValue(el, k); });

    return new Promise(function (resolve) {
      var elapsed = 0;
      var lastTime = null;

      function raf(now) {
        if (lastTime === null) lastTime = now;
        var dt = now - lastTime;
        lastTime = now;
        if (dt > 100) dt = 100;
        elapsed += dt;
        var t = ms > 0 ? Math.min(1, elapsed / ms) : 1;
        var eased = easeFn(t);
        Object.keys(props).forEach(function (k) {
          applyPropValue(el, k, startProps[k] + (props[k] - startProps[k]) * eased);
        });
        if (t < 1) {
          window.requestAnimationFrame(raf);
        } else {
          resolve();
        }
      }
      window.requestAnimationFrame(raf);
    });
  };

  VT.Motion = Motion;
})();
