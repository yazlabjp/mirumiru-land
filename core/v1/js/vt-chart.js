/**
 * vt-chart.js — 直近10回の数値表示(結果画面・先生モード)(vt-api.md §12)
 *
 * 内部専用モジュール(app.jsから呼ばない)。primaryのみを表示する。
 * 「古い→新しい」の順で数値を並べるだけの表示(バー描画はしない)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-chart.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Chart) {
    return; // 二重読み込み防止
  }

  var Chart = {};

  /**
   * recentRecords: [{value, date, settingsDigest, extras}, ...](古い→新しい順を想定)
   * primarySchema: { key, label, betterIs }
   * 戻り値: 数値羅列のDOM要素(データが無ければ「きろくがありません」の表示)。
   */
  Chart.render = function (recentRecords, primarySchema) {
    var wrap = document.createElement('div');
    wrap.className = 'vt-chart';

    var records = recentRecords || [];
    if (records.length === 0) {
      wrap.className += ' vt-chart-empty';
      wrap.textContent = 'きろくが ありません';
      return wrap;
    }

    var values = records.map(function (r) { return r.value; });
    wrap.textContent = values.join(' → ');

    return wrap;
  };

  VT.Chart = Chart;
})();
