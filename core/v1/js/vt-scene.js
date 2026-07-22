/**
 * vt-scene.js — 画面フロー(title/play/result)・先生モード・OrientationGuard・
 * 記録保存・結果画面(vt-api.md §1, §11, §12)
 *
 * 他モジュールに依存するため読み込み順の最後(vt-api.md §0)。
 * このファイルは複数のステップに分けて構築する。各セクションはIIFE内の
 * 独立したブロックとして追加し、最後に VT.Scene / VT.createApp をまとめて公開する。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-scene.js: 他のcoreモジュールを先に読み込んでください');
  }
  var VT = window.VT;

  // ============================================================
  // OrientationGuard(ai-notes.md §8)
  // matchMedia("(orientation: portrait)")の変更イベント+resizeで検知する。
  // window.orientationは使わない(非推奨)。表示中はplayを自動pause
  // (pause連携はSceneManager側でonChangeを購読して行う。後続ステップで配線)。
  // ============================================================
  var orientationState = {
    isPortrait: false,
    overlayEl: null,
    listeners: [] // onChange(isPortrait) のリスナー配列
  };

  function getIsPortrait() {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(orientation: portrait)').matches;
    }
    return (window.innerHeight || 0) > (window.innerWidth || 0);
  }

  function ensureOverlay() {
    if (orientationState.overlayEl) return orientationState.overlayEl;
    var el = document.createElement('div');
    el.className = 'vt-orientation-guard';
    el.textContent = 'がめんを よこに してください';
    document.body.appendChild(el);
    orientationState.overlayEl = el;
    return el;
  }

  function updateOrientation() {
    var isPortrait = getIsPortrait();
    if (isPortrait === orientationState.isPortrait) return; // 変化なし
    orientationState.isPortrait = isPortrait;
    if (isPortrait) {
      ensureOverlay().classList.add('vt-visible');
    } else if (orientationState.overlayEl) {
      orientationState.overlayEl.classList.remove('vt-visible');
    }
    orientationState.listeners.slice().forEach(function (fn) { fn(isPortrait); });
  }

  var OrientationGuard = {};

  OrientationGuard.isPortrait = function () { return orientationState.isPortrait; };

  /** 縦持ち⇔横持ちが切り替わるたびに fn(isPortrait) を呼ぶ。 */
  OrientationGuard.onChange = function (fn) { orientationState.listeners.push(fn); };

  /** 初期状態の判定とイベント購読を行う。ページごとに1回呼ぶ。 */
  OrientationGuard.init = function () {
    orientationState.isPortrait = getIsPortrait();
    if (orientationState.isPortrait) {
      ensureOverlay().classList.add('vt-visible');
    }
    if (typeof window.matchMedia === 'function') {
      var mq = window.matchMedia('(orientation: portrait)');
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', updateOrientation);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(updateOrientation); // 旧Safari向けフォールバック
      }
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', updateOrientation);
    }
  };

  // テスト・診断用に内部状態を直接更新するフック(実運用では使わない)
  OrientationGuard._forceUpdate = updateOrientation;

  VT._orientationGuard = OrientationGuard; // 内部専用

  // ============================================================
  // VT.createApp(def) — アプリの唯一のエントリポイント(vt-api.md §1)
  //
  // この段階では title→play→result のシーン遷移とctxの構築のみを実装する。
  // 先生モード・visibilitychange・OrientationGuardとの連携・「おわる」確認ダイアログ・
  // 結果画面の前回比/ベスト演出/グラフは後続ステップで追加する。
  // ============================================================

  function formatLocalDate(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  /** settingsに duration キーがある場合のみ、予約的な値形式を解釈する(spec-c01.md §7)。 */
  function parseDurationSetting(schema, settings) {
    if (!schema.duration) return null;
    var v = settings.duration;
    var mSec = /^(\d+)s$/.exec(v);
    if (mSec) return { mode: 'time', limitMs: parseInt(mSec[1], 10) * 1000 };
    var mCount = /^n(\d+)$/.exec(v);
    if (mCount) return { mode: 'count', target: parseInt(mCount[1], 10) };
    return null;
  }

  VT.createApp = function (def) {
    if (!def || typeof def !== 'object') {
      throw new Error('VT.createApp: def(アプリ定義オブジェクト)が必要です');
    }
    if (!def.meta || !def.meta.id || !def.meta.title) {
      throw new Error('VT.createApp: meta.id と meta.title は必須です(vt-api.md §1-1)');
    }
    if (!def.settings) {
      throw new Error('VT.createApp: settings(スキーマ)は必須です(vt-api.md §1-1)');
    }
    if (!def.record || !def.record.primary || !def.record.primary.key) {
      throw new Error('VT.createApp: record.primary は必須です(vt-api.md §1-1)');
    }
    if (typeof def.onStart !== 'function') {
      throw new Error('VT.createApp: onStart は必須です(vt-api.md §1-1)');
    }
    if (typeof def.onFinish !== 'function') {
      throw new Error('VT.createApp: onFinish は必須です(vt-api.md §1-1)');
    }

    var appId = def.meta.id;
    VT._app.setId(appId);

    var fullSchema = VT.Settings.buildFullSchema(def.settings);

    var stageEl = document.getElementById('stage');
    if (!stageEl) {
      throw new Error('VT.createApp: #stage 要素が見つかりません(_templateのindex.htmlを確認してください)');
    }

    function applySettingsSideEffects(settings) {
      VT.Feedback._setSoundEnabled(settings.sound);
      VT.Feedback._setReduceMotion(settings.reduceMotion);
      stageEl.setAttribute('data-contrast', settings.contrast); // themes.cssの背景切り替え用(vt-api.md §2-2)
    }

    var currentSettings = VT.Settings.loadForApp(appId, fullSchema);
    applySettingsSideEffects(currentSettings);

    /** playシーン開始のたびに、その時点の保存値を再読込する(vt-api.md §1-2)。 */
    function refreshSettings() {
      var raw = VT._recordStore.readSettingsRaw(appId);
      currentSettings = raw ? VT.Settings.validate(fullSchema, raw) : VT.Settings.getDefaults(fullSchema);
      applySettingsSideEffects(currentSettings);
      return currentSettings;
    }

    // ---- targetレジストリ(ctx.addTarget/removeTarget/clearTargets) ----
    var targets = new Map();

    function clearTargets() {
      targets.forEach(function (entry, el) {
        if (el.removeEventListener) el.removeEventListener('pointerdown', entry.handler);
      });
      targets.clear();
    }
    function removeTarget(el) {
      var entry = targets.get(el);
      if (!entry) return;
      if (el.removeEventListener) el.removeEventListener('pointerdown', entry.handler);
      targets.delete(el);
    }
    function addTarget(el, data) {
      if (targets.has(el)) return;
      var lastTime = -Infinity;
      function handler(evt) {
        var now = evt.timeStamp;
        // 同一ターゲット(この要素)に対する300ms以内の再タッチは無効(vt-api.md §4-2 / ai-notes.md §5)
        if (now - lastTime < 300) return;
        lastTime = now;
        var rect = stageEl.getBoundingClientRect();
        var entry = targets.get(el);
        var targetObj = {
          el: el,
          data: entry ? entry.data : data,
          x: evt.clientX - rect.left,
          y: evt.clientY - rect.top,
          pointerId: evt.pointerId,
          timeStamp: evt.timeStamp
        };
        if (def.onTouch) def.onTouch(ctx, targetObj);
      }
      el.addEventListener('pointerdown', handler);
      targets.set(el, { data: data, handler: handler });
    }

    // ---- stageTouch対応(vt-api.md §1-1): ターゲット外(ステージ全面)へのタップ ----
    if (def.stageTouch) {
      var stageLastTime = -Infinity;
      stageEl.addEventListener('pointerdown', function (evt) {
        if (evt.target !== stageEl) return; // ターゲット要素自身へのタップは各targetのhandlerに任せる
        var now = evt.timeStamp;
        if (now - stageLastTime < 300) return;
        stageLastTime = now;
        if (def.onTouch) def.onTouch(ctx, null);
      });
    }

    // ============================================================
    // 自動pause(タブ非表示・縦持ち)(vt-api.md §1-2 / ai-notes.md §1, §8)
    // 複数の要因が重なっても正しく扱えるよう、理由の集合で管理する。
    // ============================================================
    var pausedReasons = {};
    var resumeOverlayEl = null;

    function isPausedByAnyReason() { return Object.keys(pausedReasons).length > 0; }

    function engagePause() {
      if (scene !== 'play') return;
      if (rafHandle !== null) { window.cancelAnimationFrame(rafHandle); rafHandle = null; }
      VT.Feedback._pauseAudio();
      if (VT._motion) VT._motion.pauseAll();
    }
    function engageResume() {
      if (scene !== 'play') return;
      lastFrameTime = null; // 一時停止していた分の経過を無かったことにする(dt急増防止)
      VT.Feedback._resumeAudio();
      if (VT._motion) VT._motion.resumeAll();
      rafHandle = window.requestAnimationFrame(tickFrame);
    }
    function pausePlayFor(reason) {
      var wasPaused = isPausedByAnyReason();
      pausedReasons[reason] = true;
      if (!wasPaused) engagePause();
    }
    function resumePlayFor(reason) {
      delete pausedReasons[reason];
      if (!isPausedByAnyReason()) engageResume();
    }
    function clearAllPauseReasons() {
      pausedReasons = {};
      if (resumeOverlayEl && resumeOverlayEl.classList) resumeOverlayEl.classList.remove('vt-visible');
    }

    // ---- タブ非表示(visibilitychange): 自動pause。復帰時は「タッチしてつづける」オーバーレイ ----
    function ensureResumeOverlay() {
      if (resumeOverlayEl) return resumeOverlayEl;
      var el = document.createElement('div');
      el.className = 'vt-resume-overlay';
      el.textContent = 'タッチして つづける';
      el.addEventListener('pointerdown', function () {
        el.classList.remove('vt-visible');
        resumePlayFor('visibility');
      });
      document.body.appendChild(el);
      resumeOverlayEl = el;
      return el;
    }
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          pausePlayFor('visibility');
        } else if (scene === 'play' && pausedReasons.visibility) {
          ensureResumeOverlay().classList.add('vt-visible'); // タップされるまで自動再開しない
        } else {
          resumePlayFor('visibility'); // play中でなければ見た目に影響なく理由だけクリア
        }
      });
    }

    // ---- 縦持ち(OrientationGuard): 表示中は自動pause、横に戻ると自動resume(タップ不要) ----
    VT._orientationGuard.onChange(function (isPortrait) {
      if (isPortrait) pausePlayFor('orientation');
      else resumePlayFor('orientation');
    });
    VT._orientationGuard.init();
    if (VT._orientationGuard.isPortrait()) {
      pausePlayFor('orientation'); // 初期状態が縦持ちの場合、init()自体はonChangeを発火しないため明示的に反映する
    }

    // ============================================================
    // 先生モード(design.md §1-2 / ai-notes.md §1, §5)
    // 画面隅の3秒長押しで開く。開くとplayを自動pause。
    // 閉じたとき: 設定が1つでも変更されていれば現在のプレイを破棄して最初からやり直す(記録は保存しない)。
    // 無変更なら1秒の「3・2・1」表示後に再開する。
    // ============================================================
    var teacherPanelEl = null;
    var teacherDraftSettings = null;
    var teacherSettingsAtOpen = null;
    var teacherSceneBeforeOpen = null;

    function renderTeacherPanel() {
      while (teacherPanelEl.firstChild) teacherPanelEl.removeChild(teacherPanelEl.firstChild);

      // ---- 記録管理(design.md §8-4: パネル最上部に常置) ----
      var recordActions = document.createElement('div');
      recordActions.className = 'vt-panel-record-actions';

      var resetBtn = document.createElement('button');
      resetBtn.className = 'vt-btn vt-btn-reset-records';
      resetBtn.textContent = 'きろくをリセットして交代';
      resetBtn.addEventListener('pointerdown', function () {
        VT.Scene.dialog({ text: 'きろくを リセットしますか?', yesLabel: 'はい', noLabel: 'もどる' }).then(function (yes) {
          if (yes) {
            VT._recordStore.clearRecords(appId);
            renderTeacherPanel();
          }
        });
      });
      recordActions.appendChild(resetBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'vt-btn vt-btn-delete-records';
      deleteBtn.textContent = 'きろくをけす';
      deleteBtn.addEventListener('pointerdown', function () {
        // design.md §8-4: 2段階確認
        VT.Scene.dialog({ text: 'きろくを けしますか?', yesLabel: 'はい', noLabel: 'もどる' }).then(function (yes1) {
          if (!yes1) return;
          VT.Scene.dialog({ text: 'ほんとうに けしますか?', yesLabel: 'はい', noLabel: 'もどる' }).then(function (yes2) {
            if (yes2) {
              VT._recordStore.clearRecords(appId);
              renderTeacherPanel();
            }
          });
        });
      });
      recordActions.appendChild(deleteBtn);

      teacherPanelEl.appendChild(recordActions);

      var rows = document.createElement('div');
      rows.className = 'vt-panel-rows';
      Object.keys(fullSchema).forEach(function (key) {
        var fieldDef = fullSchema[key];
        var row = VT.Settings.buildSettingRow(key, fieldDef, teacherDraftSettings[key], function (newVal) {
          teacherDraftSettings[key] = newVal;
          teacherDraftSettings = VT.Settings.validate(fullSchema, teacherDraftSettings);
          VT.Settings.save(appId, teacherDraftSettings); // 変更のたびに即保存(design.md §1-2)
          renderTeacherPanel();
        });
        rows.appendChild(row);
      });
      teacherPanelEl.appendChild(rows);

      // ---- 記録の直近推移(spec-c01.md §6: primaryはグラフ、extrasは先生モード内でのみ表示) ----
      var recordsSection = document.createElement('div');
      recordsSection.className = 'vt-panel-records';
      var records = VT._recordStore.readRecords(appId);
      recordsSection.appendChild(VT.Chart.render(records.recent, def.record.primary));
      (def.record.extras || []).forEach(function (ex) {
        var line = document.createElement('div');
        line.className = 'vt-panel-extra-line';
        var vals = records.recent.map(function (r) { return r.extras && r.extras[ex.key]; }).join(', ');
        line.textContent = ex.label + ': ' + vals;
        recordsSection.appendChild(line);
      });
      teacherPanelEl.appendChild(recordsSection);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'vt-btn vt-btn-panel-close';
      closeBtn.textContent = 'とじる';
      closeBtn.addEventListener('pointerdown', closeTeacherPanel);
      teacherPanelEl.appendChild(closeBtn);
    }

    function openTeacherPanel() {
      if (teacherPanelEl) return; // 既に開いている
      teacherSceneBeforeOpen = scene;
      teacherSettingsAtOpen = Object.assign({}, currentSettings);
      teacherDraftSettings = Object.assign({}, currentSettings);

      pausePlayFor('teacher'); // scene!=='play'なら実質no-op

      teacherPanelEl = document.createElement('div');
      teacherPanelEl.className = 'vt-teacher-panel vt-visible';
      document.body.appendChild(teacherPanelEl);
      renderTeacherPanel();
    }

    function settingsChangedSincePanelOpen() {
      return Object.keys(fullSchema).some(function (key) {
        return teacherDraftSettings[key] !== teacherSettingsAtOpen[key];
      });
    }

    function showResumeCountdown(onDone) {
      var el = document.createElement('div');
      el.className = 'vt-countdown-overlay vt-visible';
      document.body.appendChild(el);
      var seq = ['3', '2', '1'];
      var i = 0;
      function step() {
        if (i >= seq.length) {
          if (el.parentNode) el.parentNode.removeChild(el);
          onDone();
          return;
        }
        el.textContent = seq[i];
        i++;
        window.setTimeout(step, 333); // 合計約1秒(ai-notes.md §1)。UI演出のみでゲーム進行には使わない
      }
      step();
    }

    function closeTeacherPanel() {
      if (!teacherPanelEl) return;
      if (teacherPanelEl.parentNode) teacherPanelEl.parentNode.removeChild(teacherPanelEl);
      teacherPanelEl = null;

      var changed = settingsChangedSincePanelOpen();

      if (teacherSceneBeforeOpen !== 'play') {
        resumePlayFor('teacher'); // scene!=='play'なので実質no-op。次回startPlay時に新設定が反映される
        return;
      }

      if (changed) {
        // 設定変更あり: 現在のプレイを破棄して最初からやり直す(途中結果は記録しない)
        resumePlayFor('teacher'); // pausedReasonsをクリアしてからstartPlay側でも再度clearされる
        startPlay();
      } else {
        // 無変更: 1秒の「3・2・1」表示後に再開する
        showResumeCountdown(function () { resumePlayFor('teacher'); });
      }
    }

    // ---- 長押しトリガー(画面左上すみ・3秒・移動許容10px。ai-notes.md §5)
    // design.md §1-2/8-6: 「長押しは児童生徒に発見される前提で設計」する。
    // 見た目を完全に隠すのではなく、小さな歯車アイコンで「ここ」と分かるようにする
    // (絵文字は使わない。ai-notes.md §8「演出・アイコンはすべて自作SVG」)。
    var teacherTriggerEl = document.createElement('div');
    teacherTriggerEl.className = 'vt-teacher-trigger';
    teacherTriggerEl.innerHTML =
      '<svg viewBox="0 0 24 24" class="vt-teacher-trigger-icon" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5' +
      'M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9L6.3 6.3"/>' +
      '</svg>';
    document.body.appendChild(teacherTriggerEl);
    if (VT.Input && typeof VT.Input.hold === 'function') {
      VT.Input.hold(teacherTriggerEl, { ms: 3000, tolerance: 10 }, function () { openTeacherPanel(); });
    }

    // ---- 「おわる」ボタン: play中のみ表示。タップで確認ダイアログ→はいで中断(ai-notes.md §0-5, §1) ----
    var abortTriggerEl = document.createElement('button');
    abortTriggerEl.className = 'vt-btn vt-abort-trigger';
    abortTriggerEl.textContent = 'おわる';
    abortTriggerEl.addEventListener('pointerdown', function () {
      pausePlayFor('confirm-abort'); // 確認中は進行を止めておく
      VT.Scene.dialog({ text: 'やめますか?', yesLabel: 'はい', noLabel: 'もどる' }).then(function (yes) {
        resumePlayFor('confirm-abort');
        if (yes) abortPlay();
      });
    });
    document.body.appendChild(abortTriggerEl);

    function clearStageDom() {
      while (stageEl.firstChild) {
        stageEl.removeChild(stageEl.firstChild);
      }
    }

    // ---- ctx(vt-api.md §4-1) ----
    var ctx = {
      settings: currentSettings,
      stage: stageEl,
      dt: 0,
      elapsed: 0,
      remaining: null,
      score: 0,
      data: {},
      rect: function () {
        var r = stageEl.getBoundingClientRect();
        return { w: r.width, h: r.height };
      },
      addTarget: addTarget,
      removeTarget: removeTarget,
      clearTargets: clearTargets,
      end: function () { finishPlay(); },
      feedback: {
        success: VT.Feedback.success,
        soft: VT.Feedback.soft,
        play: VT.Feedback.play
      }
    };

    // ---- シーン状態機械: title → play → result ----
    var scene = 'title';
    var rafHandle = null;
    var lastFrameTime = null;
    var durationInfo = null;
    var finished = false;
    var lastResult = null;

    function tickFrame(now) {
      if (scene !== 'play') return;
      if (lastFrameTime === null) lastFrameTime = now;
      var dt = now - lastFrameTime;
      lastFrameTime = now;
      if (dt > 100) dt = 100; // 上限100msでクランプ(vt-api.md §1-2)

      ctx.dt = dt;
      ctx.elapsed += dt;

      if (durationInfo && durationInfo.mode === 'time') {
        ctx.remaining = Math.max(0, durationInfo.limitMs - ctx.elapsed);
      } else if (durationInfo && durationInfo.mode === 'count') {
        ctx.remaining = Math.max(0, durationInfo.target - ctx.score);
      }

      if (def.onTick) def.onTick(ctx);
      if (scene !== 'play') return; // onTick内でctx.end()等が呼ばれた場合はここで打ち切る

      if (durationInfo && durationInfo.mode === 'time' && ctx.elapsed >= durationInfo.limitMs) {
        finishPlay(); // 制限時間の自動満了(vt-api.md §1-2)
        return;
      }

      rafHandle = window.requestAnimationFrame(tickFrame);
    }

    function startPlay() {
      refreshSettings();
      ctx.settings = currentSettings;
      durationInfo = parseDurationSetting(fullSchema, currentSettings);

      clearTargets();
      clearStageDom();
      clearAllPauseReasons();

      ctx.score = 0;
      ctx.data = {};
      ctx.elapsed = 0;
      ctx.remaining = durationInfo
        ? (durationInfo.mode === 'time' ? durationInfo.limitMs : durationInfo.target)
        : null;
      finished = false;
      lastFrameTime = null;

      scene = 'play';
      if (abortTriggerEl) abortTriggerEl.classList.add('vt-visible');
      def.onStart(ctx); // playシーン開始のたびに毎回呼ぶ(「もういっかい」でも)

      rafHandle = window.requestAnimationFrame(tickFrame);
    }

    function finishPlay() {
      if (finished) return; // 自動満了とctx.end()の競合等による二重実行を防ぐ
      finished = true;
      scene = 'result';
      clearAllPauseReasons();
      if (abortTriggerEl) abortTriggerEl.classList.remove('vt-visible');
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }

      var resultValues = def.onFinish(ctx) || {}; // 正常終了時のみ呼ぶ
      var digest = VT.Settings.digest(fullSchema, currentSettings);
      var today = formatLocalDate(new Date());
      var primaryKey = def.record.primary.key;
      var betterIs = def.record.primary.betterIs;
      var extras = {};
      (def.record.extras || []).forEach(function (ex) { extras[ex.key] = resultValues[ex.key]; });

      // 前回比の算出は保存前に行う(同一digest かつ 同日のみが対象。vt-api.md §3-1)
      var recordsBefore = VT._recordStore.readRecords(appId);
      var prevMatch = null;
      for (var i = recordsBefore.recent.length - 1; i >= 0; i--) {
        var r = recordsBefore.recent[i];
        if (r.settingsDigest === digest && r.date === today) { prevMatch = r; break; }
      }

      var savedRecords = VT._recordStore.appendRecord(appId, {
        value: resultValues[primaryKey],
        date: today,
        digest: digest,
        extras: extras
      }, betterIs);

      var currentValue = resultValues[primaryKey];
      var improvedOverPrev = null; // true=良くなった/同じ, false=悪くなった(表示しない), null=比較対象なし
      if (prevMatch) {
        improvedOverPrev = (betterIs === 'lower') ? (currentValue <= prevMatch.value) : (currentValue >= prevMatch.value);
      }

      lastResult = {
        values: resultValues,
        records: savedRecords,
        digest: digest,
        date: today,
        prevValue: prevMatch ? prevMatch.value : null,
        improvedOverPrev: improvedOverPrev,
        isNewBest: !!savedRecords.isNewBest
      };
      renderScene();
    }

    function abortPlay() {
      // 中断終了: onFinishを呼ばず、記録を保存せず、titleへ戻る(ai-notes.md §1)
      scene = 'title';
      finished = true;
      clearAllPauseReasons();
      if (abortTriggerEl) abortTriggerEl.classList.remove('vt-visible');
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      clearTargets();
      if (def.onAbort) def.onAbort(ctx);
      renderScene();
    }

    /** VT.Scene.goTitle()から呼ばれる: play中なら中断扱い、それ以外は単純にtitleへ戻る。 */
    function goTitleNow() {
      if (scene === 'play') {
        abortPlay();
      } else {
        scene = 'title';
        renderScene();
      }
    }

    // ---- 画面描画(この段階では最小限のプレースホルダーUI。本格的な見た目は後続ステップ) ----
    function renderTitle() {
      clearStageDom();
      var h1 = document.createElement('h1');
      h1.className = 'vt-title';
      h1.textContent = def.meta.title;
      var btn = document.createElement('button');
      btn.className = 'vt-btn vt-btn-start';
      btn.textContent = 'スタート';
      btn.addEventListener('pointerdown', function () {
        VT.Feedback._notifyUserGesture(); // スタートボタンのpointerdownでAudioContext生成(vt-api.md §6)
        startPlay();
      });
      stageEl.appendChild(h1);
      stageEl.appendChild(btn);
    }

    function renderResult() {
      clearStageDom();
      var h2 = document.createElement('h2');
      h2.className = 'vt-result-heading';
      h2.textContent = 'できた!';
      var value = document.createElement('div');
      value.className = 'vt-result-value';
      value.textContent = String(lastResult.values[def.record.primary.key]);

      stageEl.appendChild(h2);
      stageEl.appendChild(value);

      // 前回比: 悪くなっていた場合は何も表示しない(原則3「失敗を鳴らさない」)
      if (lastResult.improvedOverPrev === true) {
        var cmp = document.createElement('div');
        cmp.className = 'vt-result-compare';
        cmp.textContent = (lastResult.values[def.record.primary.key] === lastResult.prevValue)
          ? 'まえと おなじ!' : 'まえより よくなった!';
        stageEl.appendChild(cmp);
      }

      // ベスト演出
      if (lastResult.isNewBest) {
        var best = document.createElement('div');
        best.className = 'vt-result-best';
        best.textContent = '⭐️ これまでで いちばん!';
        stageEl.appendChild(best);
        VT.Feedback.success(value, { style: 'confetti' });
      }

      var again = document.createElement('button');
      again.className = 'vt-btn vt-btn-again';
      again.textContent = 'もういっかい';
      again.addEventListener('pointerdown', function () { startPlay(); });
      var toTitle = document.createElement('button');
      toTitle.className = 'vt-btn vt-btn-title';
      toTitle.textContent = 'タイトルへ';
      toTitle.addEventListener('pointerdown', function () { goTitleNow(); });

      stageEl.appendChild(again);
      stageEl.appendChild(toTitle);
    }

    function renderScene() {
      if (scene === 'title') renderTitle();
      else if (scene === 'result') renderResult();
      // scene === 'play' のDOMはapp.jsのonStartが作る(コア側は骨格を作らない。ai-notes.md §1)
    }

    // 内部専用: 後続ステップ(先生モード・OrientationGuard連携・結果画面拡張)からのアクセス用
    VT._app._instance = {
      def: def,
      ctx: ctx,
      fullSchema: fullSchema,
      appId: appId,
      getScene: function () { return scene; },
      getCurrentSettings: function () { return currentSettings; },
      getLastResult: function () { return lastResult; },
      startPlay: startPlay,
      finishPlay: finishPlay,
      abortPlay: abortPlay,
      goTitle: goTitleNow,
      refreshSettings: refreshSettings,
      pausePlayFor: pausePlayFor,
      resumePlayFor: resumePlayFor,
      isPausedByAnyReason: isPausedByAnyReason,
      openTeacherPanel: openTeacherPanel,
      closeTeacherPanel: closeTeacherPanel,
      getTeacherPanelEl: function () { return teacherPanelEl; },
      getTeacherTriggerEl: function () { return teacherTriggerEl; }
    };

    scene = 'title';
    renderScene();

    return ctx;
  };

  // ============================================================
  // VT.Scene — 公開部分(vt-api.md §11)
  // ============================================================
  VT.Scene = {};

  /**
   * 共通2択ダイアログ(alert/confirmの使用は禁止。ai-notes.md §0-5)。
   * { text, yesLabel="はい", noLabel="もどる" } => Promise<boolean>
   */
  VT.Scene.dialog = function (opts) {
    opts = opts || {};
    var text = opts.text || '';
    var yesLabel = opts.yesLabel || 'はい';
    var noLabel = opts.noLabel || 'もどる';

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'vt-dialog-overlay vt-visible';

      var box = document.createElement('div');
      box.className = 'vt-dialog-box';

      var p = document.createElement('p');
      p.className = 'vt-dialog-text';
      p.textContent = text;
      box.appendChild(p);

      function close(result) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }

      var yesBtn = document.createElement('button');
      yesBtn.className = 'vt-btn vt-dialog-yes';
      yesBtn.textContent = yesLabel;
      yesBtn.addEventListener('pointerdown', function () { close(true); });
      box.appendChild(yesBtn);

      var noBtn = document.createElement('button');
      noBtn.className = 'vt-btn vt-dialog-no';
      noBtn.textContent = noLabel;
      noBtn.addEventListener('pointerdown', function () { close(false); });
      box.appendChild(noBtn);

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  };

  /** 現在のアプリのタイトル画面へ戻る(play中なら中断扱い。記録は保存されない)。 */
  VT.Scene.goTitle = function () {
    var inst = VT._app._instance;
    if (inst && typeof inst.goTitle === 'function') inst.goTitle();
  };

  /** シリーズカタログ(../../index.html)へ移動する。 */
  VT.Scene.goCatalog = function () {
    window.location.href = '../../index.html';
  };
})();
