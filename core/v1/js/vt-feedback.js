/**
 * vt-feedback.js — 演出と合成音(vt-api.md §6 / ai-notes.md §6)
 *
 * AudioContextはアプリ全体で1個。スタートボタンのpointerdownで遅延生成/resumeする
 * (ページ読込時には生成しない)。settings.sound===falseの間は生成せず、play()はno-op。
 * 全音400ms以下・マスターGain既定0.3。pause中はsuspend()。ネガティブな音は存在させない。
 *
 * ライフサイクル制御(_notifyUserGesture等)はvt-scene.jsから呼ばれる内部専用関数
 * (「_」始まりはvt-api.mdに存在しない内部専用API。app.jsから呼ばない)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-feedback.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Feedback) {
    return; // 二重読み込み防止
  }

  var MASTER_GAIN_DEFAULT = 0.3;
  var STYLES = ['bounce', 'hanamaru', 'confetti'];
  var SEIKAI_SOUNDS = ['seikai1', 'seikai2', 'seikai3'];

  var state = {
    soundEnabled: true,
    reduceMotion: false,
    audioCtx: null,
    masterGain: null,
    styleRotation: 0 // success()の"auto"ローテーション用カウンタ
  };

  function ensureContext() {
    if (state.audioCtx || !state.soundEnabled) return state.audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    state.audioCtx = new Ctor();
    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = MASTER_GAIN_DEFAULT;
    state.masterGain.connect(state.audioCtx.destination);
    return state.audioCtx;
  }

  var Feedback = {};

  // ============================================================
  // 内部専用: AudioContextライフサイクル制御(vt-scene.jsから呼ばれる)
  // ============================================================

  /** スタートボタンのpointerdownで呼ぶ。soundEnabledなら生成/resumeする(iOS自動再生制限対策)。 */
  Feedback._notifyUserGesture = function () {
    if (state.soundEnabled) ensureContext();
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  };

  /** settings.soundの現在値をFeedbackへ反映する。 */
  Feedback._setSoundEnabled = function (enabled) {
    state.soundEnabled = !!enabled;
    if (!state.soundEnabled) {
      if (state.audioCtx && state.audioCtx.state !== 'suspended') state.audioCtx.suspend();
    } else if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  };

  /** settings.reduceMotionの現在値を反映する(success()の演出を簡略化する)。 */
  Feedback._setReduceMotion = function (enabled) {
    state.reduceMotion = !!enabled;
  };

  /** シーンpause時に呼ぶ。 */
  Feedback._pauseAudio = function () {
    if (state.audioCtx && state.audioCtx.state === 'running') state.audioCtx.suspend();
  };

  /** シーンresume時に呼ぶ。 */
  Feedback._resumeAudio = function () {
    if (state.soundEnabled && state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  };

  // ============================================================
  // 音の合成(全音400ms以下・マスターGain既定0.3)
  // 各音は [{freq, offset, dur, type, peak}] のトーン列(単位: 秒)。offset+durの最大が0.4sを超えないこと。
  // ============================================================
  var SOUND_DEFS = {
    tap: [
      { freq: 600, offset: 0, dur: 0.05, type: 'sine', peak: 0.6 }
    ],
    seikai1: [
      { freq: 523.25, offset: 0, dur: 0.09, type: 'sine', peak: 0.7 },
      { freq: 659.25, offset: 0.09, dur: 0.11, type: 'sine', peak: 0.7 }
    ],
    seikai2: [
      { freq: 587.33, offset: 0, dur: 0.09, type: 'sine', peak: 0.7 },
      { freq: 739.99, offset: 0.09, dur: 0.11, type: 'sine', peak: 0.7 }
    ],
    seikai3: [
      { freq: 659.25, offset: 0, dur: 0.09, type: 'sine', peak: 0.7 },
      { freq: 830.61, offset: 0.09, dur: 0.11, type: 'sine', peak: 0.7 }
    ],
    kirakira: [
      { freq: 1046.50, offset: 0, dur: 0.07, type: 'sine', peak: 0.5 },
      { freq: 1318.51, offset: 0.08, dur: 0.07, type: 'sine', peak: 0.5 },
      { freq: 1567.98, offset: 0.16, dur: 0.10, type: 'sine', peak: 0.5 }
    ],
    fanfare: [
      { freq: 523.25, offset: 0, dur: 0.10, type: 'triangle', peak: 0.7 },
      { freq: 659.25, offset: 0.10, dur: 0.10, type: 'triangle', peak: 0.7 },
      { freq: 783.99, offset: 0.20, dur: 0.18, type: 'triangle', peak: 0.7 }
    ],
    countdown: [
      { freq: 440, offset: 0, dur: 0.10, type: 'square', peak: 0.5 }
    ]
  };

  function playTone(ctx, masterGain, def, startTime) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = def.type;
    osc.frequency.value = def.freq;
    var t0 = startTime + def.offset;
    var t1 = t0 + def.dur;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(def.peak, t0 + Math.min(0.01, def.dur / 4));
    gain.gain.linearRampToValueAtTime(0, t1);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t1 + 0.01);
  }

  /** 効果音のみ再生する(vt-api.md §6)。sound:false時はno-op。未定義名は無視。 */
  Feedback.play = function (name) {
    if (!state.soundEnabled) return;
    var ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var def = SOUND_DEFS[name];
    if (!def) return; // ネガティブ音を新設しない(未知の名前は静かに無視)
    var now = ctx.currentTime;
    def.forEach(function (tone) { playTone(ctx, state.masterGain, tone, now); });
  };

  // ============================================================
  // 視覚演出(CSSクラスの一時付与。実アニメーションはcomponents.cssで定義)
  // ============================================================
  var FX_DURATION_MS = { bounce: 500, hanamaru: 600, confetti: 700, soft: 300, flash: 250 };

  function isElement(x) {
    return !!x && typeof x === 'object' && typeof x.nodeType === 'number';
  }

  function applyFxClass(el, className, durationMs) {
    if (!el || !el.classList) return;
    el.classList.add(className);
    setTimeout(function () {
      if (el.classList) el.classList.remove(className);
    }, durationMs);
  }

  /** elOrPointが要素ならそれを対象に、{x,y}なら#stage上に一時マーカーを生成して演出する。 */
  function resolveTargetElement(elOrPoint) {
    if (isElement(elOrPoint)) return { el: elOrPoint, isTemp: false };
    var stage = document.getElementById('stage');
    if (!stage || typeof document.createElement !== 'function') {
      return { el: null, isTemp: false };
    }
    var marker = document.createElement('div');
    marker.className = 'vt-fx-marker';
    var x = (elOrPoint && elOrPoint.x) || 0;
    var y = (elOrPoint && elOrPoint.y) || 0;
    marker.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;';
    stage.appendChild(marker);
    return { el: marker, isTemp: true };
  }

  /** 正解演出+正解音(vt-api.md §6)。"auto"(既定)はbounce/hanamaru/confettiをローテーション。 */
  Feedback.success = function (elOrPoint, opts) {
    opts = opts || {};
    var style = opts.style || 'auto';
    var chosenStyle;
    var soundName;

    if (style === 'auto') {
      var idx = state.styleRotation % STYLES.length;
      chosenStyle = STYLES[idx];
      soundName = SEIKAI_SOUNDS[idx];
      state.styleRotation += 1;
    } else {
      chosenStyle = style;
      var i2 = STYLES.indexOf(style);
      soundName = SEIKAI_SOUNDS[i2 >= 0 ? i2 : 0];
    }

    var target = resolveTargetElement(elOrPoint);
    if (target.el) {
      if (state.reduceMotion) {
        // reduceMotion:true時は演出を簡略化(短いフラッシュのみ。課題必須の動きには影響しない)
        applyFxClass(target.el, 'vt-fx-flash', FX_DURATION_MS.flash);
      } else {
        applyFxClass(target.el, 'vt-fx-' + chosenStyle, FX_DURATION_MS[chosenStyle] || 500);
      }
      if (target.isTemp) {
        var cleanupDelay = (state.reduceMotion ? FX_DURATION_MS.flash : (FX_DURATION_MS[chosenStyle] || 500)) + 50;
        setTimeout(function () {
          if (target.el.parentNode && target.el.parentNode.removeChild) {
            target.el.parentNode.removeChild(target.el);
          }
        }, cleanupDelay);
      }
    }

    Feedback.play(soundName);
  };

  /** 不正解の静かな揺れ(音なし)。これ以外の不正解演出を作らない(vt-api.md §6)。 */
  Feedback.soft = function (el) {
    if (!isElement(el)) return;
    applyFxClass(el, 'vt-fx-soft', FX_DURATION_MS.soft);
    // 音は意図的に鳴らさない(Feedback.playを呼ばない)
  };

  VT.Feedback = Feedback;
})();
