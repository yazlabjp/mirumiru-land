/**
 * vt-chart.js — 直近10回グラフ(結果画面・先生モード)(vt-api.md §12)
 *
 * 内部専用モジュール(app.jsから呼ばない)。primaryのみを描画する。
 * betterIs:"lower"は「短いほど伸びる」メタファーで反転表現する(値が小さいほどバーが高くなる)。
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
   * 戻り値: 簡易バーグラフのDOM要素(データが無ければ「きろくがありません」の表示)。
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
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    var betterIsLower = primarySchema && primarySchema.betterIs === 'lower';

    records.forEach(function (r) {
      var bar = document.createElement('div');
      bar.className = 'vt-chart-bar';
      var ratio;
      if (max === min) {
        ratio = 1;
      } else if (betterIsLower) {
        ratio = (max - r.value) / (max - min); // 短い(小さい)ほど高いバー
      } else {
        ratio = (r.value - min) / (max - min);
      }
      var heightPct = 10 + ratio * 90; // 最小でも10%は見えるようにする
      bar.style.height = heightPct + '%';
      bar.title = String(r.value);
      wrap.appendChild(bar);
    });

    return wrap;
  };

  VT.Chart = Chart;
})();
