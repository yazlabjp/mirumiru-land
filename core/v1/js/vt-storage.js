/**
 * vt-storage.js — 設定と記録の保存(vt-api.md §7 / §12)
 *
 * 公開API: VT.Storage(アプリ自由データ。vt.<appId>.x.<key> に名前空間化)
 * 内部専用: VT._recordStore(設定・記録の生の読み書き。app.jsから直接操作禁止。
 *           vt-api.md §12「RecordStore(vt-storage内)」に対応)
 *
 * バックエンドは現在LocalStorage。呼び出し側のAPIを変えずにIndexedDB等へ
 * 差し替えられるよう、直接 localStorage を叩くのはこのファイルに閉じ込める(design.md §8-4)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-storage.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Storage) {
    // 二重読み込み防止
    return;
  }

  var NS_PREFIX = 'vt.';
  var MAX_RECENT = 10; // design.md §8-4: recentは最大10件

  function safeParse(json, fallback) {
    if (json === null || json === undefined) return fallback;
    try {
      return JSON.parse(json);
    } catch (e) {
      return fallback;
    }
  }

  function currentAppId() {
    var id = VT._app && VT._app.id;
    if (!id) {
      throw new Error('VT.Storage: アプリIDが未登録です(VT.createApp()呼び出し後に使ってください)');
    }
    return id;
  }

  // ============================================================
  // VT.Storage — 公開API(vt-api.md §7)
  // ============================================================
  var Storage = {};

  Storage.get = function (key, fallback) {
    var full = NS_PREFIX + currentAppId() + '.x.' + key;
    try {
      return safeParse(window.localStorage.getItem(full), fallback);
    } catch (e) {
      // LocalStorage不可(プライベートブラウズ等)・破損時もfallbackで継続(例外を投げない)
      return fallback;
    }
  };

  Storage.set = function (key, value) {
    var full = NS_PREFIX + currentAppId() + '.x.' + key;
    try {
      window.localStorage.setItem(full, JSON.stringify(value));
      return true;
    } catch (e) {
      return false; // 容量超過等
    }
  };

  Storage.remove = function (key) {
    var full = NS_PREFIX + currentAppId() + '.x.' + key;
    try {
      window.localStorage.removeItem(full);
    } catch (e) {
      // no-op
    }
  };

  VT.Storage = Storage;

  // ============================================================
  // RecordStore — 内部専用(vt-api.md §12。app.jsから直接操作禁止)
  // 設定(vt.<id>.settings)と記録(vt.<id>.records)の生の読み書き。
  // スキーマ検証はvt-settings.jsの責務。前回比判定・グラフ描画はvt-scene.js/vt-chart.jsの責務。
  // ============================================================
  var RecordStore = {};

  function settingsKey(appId) { return NS_PREFIX + appId + '.settings'; }
  function recordsKey(appId) { return NS_PREFIX + appId + '.records'; }
  function emptyRecords() { return { best: null, recent: [] }; }

  /** 生の設定オブジェクトを読む(検証なし)。存在しない/破損時は null。 */
  RecordStore.readSettingsRaw = function (appId) {
    try {
      return safeParse(window.localStorage.getItem(settingsKey(appId)), null);
    } catch (e) {
      return null;
    }
  };

  /** 検証済みの設定オブジェクトをそのまま保存する(検証はvt-settings.js側で行う)。 */
  RecordStore.writeSettingsRaw = function (appId, settingsObj) {
    try {
      window.localStorage.setItem(settingsKey(appId), JSON.stringify(settingsObj));
      return true;
    } catch (e) {
      return false;
    }
  };

  /** 記録オブジェクト{best, recent}を読む。存在しない/破損時は空の記録を返す(エラーを投げない)。 */
  RecordStore.readRecords = function (appId) {
    try {
      var parsed = safeParse(window.localStorage.getItem(recordsKey(appId)), null);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.recent)) {
        return emptyRecords();
      }
      return parsed;
    } catch (e) {
      return emptyRecords();
    }
  };

  /**
   * 新しい記録を1件追加する(vt-api.md §3-1)。中断終了時は呼ばないこと(ai-notes §1)。
   * entry: { value, date, digest, extras }
   * betterIs: "higher" | "lower" (bestの更新判定)
   * 戻り値: 保存後の records オブジェクト { best, recent }
   */
  RecordStore.appendRecord = function (appId, entry, betterIs) {
    var records = RecordStore.readRecords(appId);
    var recent = records.recent.slice();
    recent.push({
      value: entry.value,
      date: entry.date,
      settingsDigest: entry.digest,
      extras: entry.extras || {}
    });
    if (recent.length > MAX_RECENT) {
      recent = recent.slice(recent.length - MAX_RECENT); // 古いものから自動削除
    }

    var best = records.best;
    var isBetter = !best || (betterIs === 'lower' ? entry.value < best.value : entry.value > best.value);
    if (isBetter) {
      best = { value: entry.value, date: entry.date };
    }

    var updated = { best: best, recent: recent, isNewBest: isBetter };
    try {
      window.localStorage.setItem(recordsKey(appId), JSON.stringify(updated));
    } catch (e) {
      // 保存失敗時もメモリ上の結果は返す(design.md: 記録は消えても致命傷でない設計で割り切る)
    }
    return updated;
  };

  /**
   * 「きろくをリセットして交代」「きろくをけす」共通の内部処理: 全記録を消去する。
   * 確認ダイアログ・2段階確認等のUIフローはvt-scene.js(先生パネル)側の責務。
   */
  RecordStore.clearRecords = function (appId) {
    try {
      window.localStorage.removeItem(recordsKey(appId));
    } catch (e) {
      // no-op
    }
    return emptyRecords();
  };

  VT._recordStore = RecordStore;
})();
