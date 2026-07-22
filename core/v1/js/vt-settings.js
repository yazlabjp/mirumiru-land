/**
 * vt-settings.js — 設定スキーマ検証・共通設定付与・digest・設定コード(vt-api.md §2, §3-2, §12 / ai-notes.md §3, §4)
 *
 * このファイルはDOMに依存しないデータ層を実装する。
 * 先生パネルのUI自動生成(vt-api.md §12)はvt-scene.jsのTeacherPanel実装と合わせて
 * 後続ステップで行う(CSS未整備のため。データ層が先に固まっていれば安全に追加できる)。
 *
 * 内部専用: VT._recordStore(vt-storage.js)を利用して設定の生の読み書きを行う。
 * app.jsはこのファイルの関数を直接呼ばない(先生パネル・coreの初期化処理から使われる)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-settings.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Settings) {
    return; // 二重読み込み防止
  }

  var ALLOWED_TYPES = { choice: true, range: true, toggle: true };

  // ---- 共通設定(vt-api.md §2-2): 全アプリのスキーマ末尾に自動追加。全てdifficulty:false ----
  var COMMON_SETTINGS = {
    sound: { type: 'toggle', label: '音', default: true, difficulty: false },
    reduceMotion: { type: 'toggle', label: 'うごき ひかえめ', default: false, difficulty: false },
    mirror: { type: 'toggle', label: '左右はんてん', default: false, difficulty: false },
    contrast: {
      type: 'choice', label: 'はいけい', default: 'kinari', difficulty: false,
      options: [
        { value: 'kinari', label: '生成り' },
        { value: 'white', label: '白' },
        { value: 'black', label: '黒' }
      ]
    }
  };
  var COMMON_KEYS = Object.keys(COMMON_SETTINGS);

  var Settings = {};

  // ============================================================
  // スキーマ構築・検証(vt-api.md §2, §2-3)
  // ============================================================

  /**
   * アプリのsettingsスキーマに共通設定(§2-2)を末尾付与した「完全なスキーマ」を返す。
   * 未知の型・共通設定との名前衝突は開発ミスとして即座に例外を投げる(fail fast)。
   */
  Settings.buildFullSchema = function (appSchema) {
    appSchema = appSchema || {};
    Object.keys(appSchema).forEach(function (key) {
      var def = appSchema[key];
      if (!def || !ALLOWED_TYPES[def.type]) {
        throw new Error('VT.Settings: 未知の設定型 "' + (def && def.type) + '"(key=' + key +
          ')。choice/range/toggle以外は使えません(ai-notes.md §3)');
      }
      if (COMMON_KEYS.indexOf(key) !== -1) {
        throw new Error('VT.Settings: "' + key + '" は共通設定の予約キーです。' +
          'アプリ側で同名キーを定義できません(vt-api.md §2-2)');
      }
    });

    var full = {};
    Object.keys(appSchema).forEach(function (key) { full[key] = appSchema[key]; });
    COMMON_KEYS.forEach(function (key) { full[key] = COMMON_SETTINGS[key]; });
    return full;
  };

  /** スキーマの既定値だけを集めたオブジェクトを返す。 */
  Settings.getDefaults = function (fullSchema) {
    var out = {};
    Object.keys(fullSchema).forEach(function (key) { out[key] = fullSchema[key].default; });
    return out;
  };

  function validateOne(def, raw) {
    if (raw === undefined) return def.default;
    switch (def.type) {
      case 'choice': {
        var found = (def.options || []).some(function (o) { return o.value === raw; });
        return found ? raw : def.default; // 未知のchoice値→default
      }
      case 'range': {
        var n = Number(raw);
        if (!isFinite(n)) return def.default;
        return VT._util.clamp(n, def.min, def.max); // min〜maxにクランプ
      }
      case 'toggle':
        return typeof raw === 'boolean' ? raw : def.default;
      default:
        return def.default;
    }
  }

  /**
   * 生の設定オブジェクトをスキーマで検証する(読込時・設定コード適用時共通。vt-api.md §2-3)。
   * 未知キーは無視(戻り値にはfullSchemaのキーしか出てこない)。
   */
  Settings.validate = function (fullSchema, rawObj) {
    rawObj = rawObj || {};
    var out = {};
    Object.keys(fullSchema).forEach(function (key) {
      out[key] = validateOne(fullSchema[key], rawObj[key]);
    });
    return out;
  };

  // ============================================================
  // digest(vt-api.md §3-2 / ai-notes.md §3)
  // ============================================================

  /**
   * difficulty:falseを除く全設定のvalueを、スキーマ定義順に "/" で連結する。
   * validatedSettingsは Settings.validate() を通した値を渡すこと。
   */
  Settings.digest = function (fullSchema, validatedSettings) {
    var parts = [];
    Object.keys(fullSchema).forEach(function (key) {
      var def = fullSchema[key];
      var isDifficulty = def.difficulty !== false; // 未指定はdifficulty:true扱い
      if (isDifficulty) {
        parts.push(String(validatedSettings[key]));
      }
    });
    return parts.join('/');
  };

  // ============================================================
  // 設定コード(SettingsCode)(ai-notes.md §4 / vt-api.md §12)
  // URL形式: ...?s=<base64url(encodeURIComponent(JSON))>
  // JSON: { v: 1, id: string, set: {key: value} }
  // ============================================================

  function toBase64Url(asciiStr) {
    var b64 = (typeof window.btoa === 'function')
      ? window.btoa(asciiStr)
      : Buffer.from(asciiStr, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return (typeof window.atob === 'function')
      ? window.atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  }

  /** { v, id, set } を設定コード文字列(base64url。"?s="の値部分)にエンコードする。 */
  Settings.encodeCode = function (payload) {
    var json = JSON.stringify(payload);
    var encoded = encodeURIComponent(json);
    return toBase64Url(encoded);
  };

  /** 設定コード文字列をデコードする。破損・形式不正時はnull(例外を投げない)。 */
  Settings.decodeCode = function (codeStr) {
    try {
      var encoded = fromBase64Url(codeStr);
      var json = decodeURIComponent(encoded);
      var payload = JSON.parse(json);
      if (!payload || typeof payload !== 'object' ||
          payload.v !== 1 || typeof payload.id !== 'string' ||
          !payload.set || typeof payload.set !== 'object') {
        return null;
      }
      return payload;
    } catch (e) {
      return null;
    }
  };

  /**
   * 設定コードをappId向けに検証する。idが一致しない・破損している場合はnull
   * (呼び出し側は「無言で無視して通常起動」する。ai-notes.md §4)。
   * 一致していれば、setの中身をスキーマ検証した結果(§2-3)を返す。
   */
  Settings.validateCodeForApp = function (codeStr, appId, fullSchema) {
    var payload = Settings.decodeCode(codeStr);
    if (!payload || payload.id !== appId) return null;
    return Settings.validate(fullSchema, payload.set);
  };

  /** 現在の検証済み設定から、共有・保存用の設定コード文字列を作る(先生パネルの「コピー」機能用)。 */
  Settings.buildCode = function (appId, validatedSettings) {
    return Settings.encodeCode({ v: 1, id: appId, set: validatedSettings });
  };

  // ============================================================
  // 起動時ロード(URLの?s=優先 → 保存値 → 既定値)
  // ============================================================

  function parseQuery(search) {
    var result = {};
    if (!search) return result;
    var qs = search.charAt(0) === '?' ? search.slice(1) : search;
    qs.split('&').forEach(function (pair) {
      if (!pair) return;
      var idx = pair.indexOf('=');
      var k = idx === -1 ? pair : pair.slice(0, idx);
      var v = idx === -1 ? '' : pair.slice(idx + 1);
      try {
        result[decodeURIComponent(k)] = decodeURIComponent(v);
      } catch (e) {
        // 壊れたクエリは無視
      }
    });
    return result;
  }

  /**
   * アプリ起動時の設定を決定する。
   * 1. URLに ?s=<code> があり、idが一致・検証OKならそれを採用し保存する
   * 2. 保存済み設定があればスキーマ検証して採用する
   * 3. どちらも無ければ既定値
   * opts.search を渡すとテスト等でURLクエリを差し替えられる(省略時はwindow.location.search)。
   */
  Settings.loadForApp = function (appId, fullSchema, opts) {
    opts = opts || {};
    var search = (opts.search !== undefined)
      ? opts.search
      : (window.location ? window.location.search : '');
    var params = parseQuery(search);

    if (params.s) {
      var fromCode = Settings.validateCodeForApp(params.s, appId, fullSchema);
      if (fromCode) {
        VT._recordStore.writeSettingsRaw(appId, fromCode);
        return fromCode;
      }
      // 不正・不一致コードは無言で無視して通常起動(ai-notes.md §4)
    }

    var raw = VT._recordStore.readSettingsRaw(appId);
    if (raw) {
      return Settings.validate(fullSchema, raw);
    }
    return Settings.getDefaults(fullSchema);
  };

  /** 検証済み設定を保存する(先生パネルでの変更確定時に呼ぶ)。 */
  Settings.save = function (appId, validatedSettings) {
    return VT._recordStore.writeSettingsRaw(appId, validatedSettings);
  };

  // ============================================================
  // 先生パネルの行UI自動生成(vt-api.md §12)
  // choice→セグメントボタン, range→-/+ステッパー, toggle→スイッチ。
  // 状態は持たない純粋関数: 現在値を渡すと、それを反映した行を毎回新しく作る。
  // 値が変わるたびに呼び出し側がonChangeを受けて再描画する想定。
  // ============================================================
  Settings.buildSettingRow = function (key, def, value, onChange) {
    var row = document.createElement('div');
    row.className = 'vt-setting-row vt-setting-' + def.type;

    var label = document.createElement('span');
    label.className = 'vt-setting-label';
    label.textContent = def.label || key;
    row.appendChild(label);

    var control = document.createElement('div');
    control.className = 'vt-setting-control';

    if (def.type === 'choice') {
      (def.options || []).forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vt-seg-btn' + (opt.value === value ? ' vt-seg-btn-active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('pointerdown', function () {
          if (opt.value !== value) onChange(opt.value);
        });
        control.appendChild(btn);
      });
    } else if (def.type === 'range') {
      var step = def.step || 1;
      var minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'vt-stepper-btn vt-stepper-minus';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('pointerdown', function () {
        onChange(VT._util.clamp(value - step, def.min, def.max));
      });
      var display = document.createElement('span');
      display.className = 'vt-stepper-value';
      display.textContent = String(value);
      var plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'vt-stepper-btn vt-stepper-plus';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('pointerdown', function () {
        onChange(VT._util.clamp(value + step, def.min, def.max));
      });
      control.appendChild(minusBtn);
      control.appendChild(display);
      control.appendChild(plusBtn);
    } else if (def.type === 'toggle') {
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'vt-switch' + (value ? ' vt-switch-on' : ' vt-switch-off');
      sw.textContent = value ? 'ON' : 'OFF';
      sw.addEventListener('pointerdown', function () { onChange(!value); });
      control.appendChild(sw);
    }

    row.appendChild(control);
    return row;
  };

  VT.Settings = Settings;
})();
