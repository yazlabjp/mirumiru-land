/**
 * vt-stim.js — 自作SVG刺激(vt-api.md §8)
 *
 * 色はthemes.cssのCSS変数(var(--stim-red)等)を使う。生成物はSVGElementで、
 * そのままstageへappendできる。絵文字は使わない(ai-notes.md §8)。
 *
 * 注記: この段階のカード絵柄は基本図形の組み合わせによる簡易プレースホルダーである。
 * VT.Stim.card/random/shape のAPI・戻り値の形は変えずに、後から本格的なSVG素材へ
 * 差し替え可能な構造にしてある(themeごとの draw(svg) 関数を差し替えるだけでよい)。
 */
(function () {
  'use strict';

  if (!window.VT) {
    throw new Error('vt-stim.js: vt-core.js を先に読み込んでください');
  }
  var VT = window.VT;

  if (VT.Stim) {
    return; // 二重読み込み防止
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    return e;
  }
  function circle(cx, cy, r, fill) { return svgEl('circle', { cx: cx, cy: cy, r: r, fill: fill }); }
  function ellipse(cx, cy, rx, ry, fill) { return svgEl('ellipse', { cx: cx, cy: cy, rx: rx, ry: ry, fill: fill }); }
  function rect(x, y, w, h, fill, rx) {
    var a = { x: x, y: y, width: w, height: h, fill: fill };
    if (rx) a.rx = rx;
    return svgEl('rect', a);
  }
  function path(d, fill) { return svgEl('path', { d: d, fill: fill }); }

  // ============================================================
  // どうぶつテーマ
  // ============================================================
  function drawRabbit(g) {
    g.appendChild(ellipse(35, 25, 8, 20, 'var(--stim-pink)'));
    g.appendChild(ellipse(65, 25, 8, 20, 'var(--stim-pink)'));
    g.appendChild(circle(50, 60, 32, 'var(--stim-white)'));
    g.appendChild(circle(40, 55, 4, 'var(--stim-black)'));
    g.appendChild(circle(60, 55, 4, 'var(--stim-black)'));
    g.appendChild(circle(50, 68, 5, 'var(--stim-pink)'));
  }
  function drawCat(g) {
    g.appendChild(path('M28 30 L40 10 L45 32 Z', 'var(--stim-orange)'));
    g.appendChild(path('M72 30 L60 10 L55 32 Z', 'var(--stim-orange)'));
    g.appendChild(circle(50, 58, 30, 'var(--stim-orange)'));
    g.appendChild(circle(40, 54, 4, 'var(--stim-black)'));
    g.appendChild(circle(60, 54, 4, 'var(--stim-black)'));
    g.appendChild(path('M46 64 L54 64 L50 70 Z', 'var(--stim-pink)'));
  }
  function drawDog(g) {
    g.appendChild(ellipse(30, 40, 10, 20, 'var(--stim-brown)'));
    g.appendChild(ellipse(70, 40, 10, 20, 'var(--stim-brown)'));
    g.appendChild(circle(50, 58, 30, 'var(--stim-brown)'));
    g.appendChild(circle(40, 54, 4, 'var(--stim-black)'));
    g.appendChild(circle(60, 54, 4, 'var(--stim-black)'));
    g.appendChild(circle(50, 68, 6, 'var(--stim-black)'));
  }
  function drawBear(g) {
    g.appendChild(circle(28, 26, 10, 'var(--stim-brown)'));
    g.appendChild(circle(72, 26, 10, 'var(--stim-brown)'));
    g.appendChild(circle(50, 58, 32, 'var(--stim-brown)'));
    g.appendChild(circle(40, 54, 4, 'var(--stim-black)'));
    g.appendChild(circle(60, 54, 4, 'var(--stim-black)'));
    g.appendChild(circle(50, 66, 8, 'var(--stim-white)'));
  }
  function drawElephant(g) {
    g.appendChild(ellipse(20, 45, 16, 22, 'var(--stim-gray)'));
    g.appendChild(ellipse(80, 45, 16, 22, 'var(--stim-gray)'));
    g.appendChild(circle(50, 50, 28, 'var(--stim-gray)'));
    g.appendChild(path('M50 70 C50 85 60 88 55 95', 'var(--stim-gray)'));
    g.appendChild(circle(40, 46, 4, 'var(--stim-black)'));
    g.appendChild(circle(60, 46, 4, 'var(--stim-black)'));
  }

  // ============================================================
  // くだものテーマ
  // ============================================================
  function drawApple(g) {
    g.appendChild(circle(50, 58, 30, 'var(--stim-red)'));
    g.appendChild(rect(47, 20, 6, 14, 'var(--stim-brown)'));
    g.appendChild(path('M53 24 C65 18 70 28 58 32 Z', 'var(--stim-green)'));
  }
  function drawBanana(g) {
    g.appendChild(path('M30 75 C25 45 45 20 70 22 C68 30 45 35 40 60 C38 68 34 74 30 75 Z', 'var(--stim-yellow)'));
  }
  function drawGrapes(g) {
    [[38, 40], [58, 40], [30, 55], [50, 55], [70, 55], [40, 70], [60, 70]].forEach(function (p) {
      g.appendChild(circle(p[0], p[1], 11, 'var(--stim-purple)'));
    });
    g.appendChild(path('M50 20 L50 32', 'var(--stim-green)'));
  }
  function drawStrawberry(g) {
    g.appendChild(path('M50 20 C25 20 20 55 50 88 C80 55 75 20 50 20 Z', 'var(--stim-red)'));
    [[40, 40], [60, 40], [35, 55], [65, 55], [50, 65]].forEach(function (p) {
      g.appendChild(circle(p[0], p[1], 2.5, 'var(--stim-yellow)'));
    });
    g.appendChild(path('M40 20 L50 10 L60 20 Z', 'var(--stim-green)'));
  }
  function drawOrange(g) {
    g.appendChild(circle(50, 55, 30, 'var(--stim-orange)'));
    g.appendChild(rect(48, 20, 4, 8, 'var(--stim-green)'));
  }

  // ============================================================
  // のりものテーマ
  // ============================================================
  function drawCar(g) {
    g.appendChild(rect(15, 45, 70, 25, 'var(--stim-blue)', 6));
    g.appendChild(path('M28 45 L38 25 L62 25 L72 45 Z', 'var(--stim-blue)'));
    g.appendChild(circle(30, 72, 9, 'var(--stim-black)'));
    g.appendChild(circle(70, 72, 9, 'var(--stim-black)'));
  }
  function drawTrain(g) {
    g.appendChild(rect(15, 25, 70, 45, 'var(--stim-green)', 8));
    g.appendChild(rect(24, 35, 20, 16, 'var(--stim-white)'));
    g.appendChild(rect(56, 35, 20, 16, 'var(--stim-white)'));
    g.appendChild(circle(28, 78, 7, 'var(--stim-black)'));
    g.appendChild(circle(72, 78, 7, 'var(--stim-black)'));
  }
  function drawPlane(g) {
    g.appendChild(path('M10 55 L90 50 L70 42 L30 42 Z', 'var(--stim-gray)'));
    g.appendChild(path('M45 42 L55 15 L62 42 Z', 'var(--stim-gray)'));
    g.appendChild(path('M45 55 L55 82 L62 55 Z', 'var(--stim-gray)'));
  }
  function drawBus(g) {
    g.appendChild(rect(12, 18, 76, 52, 'var(--stim-yellow)', 8));
    [22, 42, 62].forEach(function (x) { g.appendChild(rect(x, 28, 14, 14, 'var(--stim-white)')); });
    g.appendChild(circle(28, 78, 8, 'var(--stim-black)'));
    g.appendChild(circle(72, 78, 8, 'var(--stim-black)'));
  }
  function drawBicycle(g) {
    g.appendChild(svgEl('circle', { cx: 26, cy: 65, r: 18, fill: 'none', stroke: 'var(--stim-black)', 'stroke-width': 4 }));
    g.appendChild(svgEl('circle', { cx: 74, cy: 65, r: 18, fill: 'none', stroke: 'var(--stim-black)', 'stroke-width': 4 }));
    g.appendChild(svgEl('path', { d: 'M26 65 L50 30 L74 65 M50 30 L40 65', fill: 'none', stroke: 'var(--stim-blue)', 'stroke-width': 4 }));
  }

  var THEMES = {
    animals: [
      { name: 'usagi', draw: drawRabbit },
      { name: 'neko', draw: drawCat },
      { name: 'inu', draw: drawDog },
      { name: 'kuma', draw: drawBear },
      { name: 'zou', draw: drawElephant }
    ],
    fruits: [
      { name: 'ringo', draw: drawApple },
      { name: 'banana', draw: drawBanana },
      { name: 'budou', draw: drawGrapes },
      { name: 'ichigo', draw: drawStrawberry },
      { name: 'mikan', draw: drawOrange }
    ],
    vehicles: [
      { name: 'kuruma', draw: drawCar },
      { name: 'densha', draw: drawTrain },
      { name: 'hikouki', draw: drawPlane },
      { name: 'basu', draw: drawBus },
      { name: 'jitensha', draw: drawBicycle }
    ]
  };

  function findCardDef(theme, name) {
    var t = THEMES[theme];
    if (!t) return null;
    for (var i = 0; i < t.length; i++) {
      if (t[i].name === name) return t[i];
    }
    return null;
  }

  var Stim = {};

  Stim.themes = function () { return Object.keys(THEMES); };

  Stim.list = function (theme) {
    var t = THEMES[theme];
    return t ? t.map(function (c) { return c.name; }) : [];
  };

  /** 絵カードを1枚生成する。nameを省略するとテーマ内ランダム。 */
  Stim.card = function (theme, name, opts) {
    opts = opts || {};
    var size = opts.size || 120;
    var t = THEMES[theme];
    if (!t || t.length === 0) {
      throw new Error('VT.Stim: 未知のテーマ "' + theme + '"');
    }
    var def = name ? findCardDef(theme, name) : t[VT.Rand.int(0, t.length - 1)];
    if (!def) {
      throw new Error('VT.Stim: テーマ "' + theme + '" にカード "' + name + '" はありません');
    }
    var svg = svgEl('svg', {
      viewBox: '0 0 100 100', width: size, height: size,
      'class': 'vt-stim vt-stim-' + def.name
    });
    def.draw(svg);
    return svg;
  };

  /** 除外指定付きランダム(妨害刺激の生成に)。 */
  Stim.random = function (theme, opts) {
    opts = opts || {};
    var exclude = opts.exclude || [];
    var t = THEMES[theme];
    if (!t || t.length === 0) {
      throw new Error('VT.Stim: 未知のテーマ "' + theme + '"');
    }
    var candidates = t.filter(function (c) { return exclude.indexOf(c.name) === -1; });
    var pool = candidates.length > 0 ? candidates : t; // 全部除外時は諦めて全体から選ぶ(無限ループ防止)
    var picked = pool[VT.Rand.int(0, pool.length - 1)];
    return { name: picked.name, el: Stim.card(theme, picked.name, opts) };
  };

  function starPathD(cx, cy, rOuter, rInner, points) {
    var d = '';
    for (var i = 0; i < points * 2; i++) {
      var r = (i % 2 === 0) ? rOuter : rInner;
      var angle = (Math.PI / points) * i - Math.PI / 2;
      var x = cx + r * Math.cos(angle);
      var y = cy + r * Math.sin(angle);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    return d + 'Z';
  }

  /** 基本図形(circle/triangle/square/star/heart)を生成する。 */
  Stim.shape = function (opts) {
    opts = opts || {};
    var shape = opts.shape || 'circle';
    var color = opts.color || 'var(--stim-blue)';
    var size = opts.size || 80;
    var svg = svgEl('svg', {
      viewBox: '0 0 100 100', width: size, height: size,
      'class': 'vt-stim vt-shape-' + shape
    });
    switch (shape) {
      case 'circle': svg.appendChild(circle(50, 50, 45, color)); break;
      case 'square': svg.appendChild(rect(8, 8, 84, 84, color, 6)); break;
      case 'triangle': svg.appendChild(path('M50 6 L94 90 L6 90 Z', color)); break;
      case 'star': svg.appendChild(path(starPathD(50, 50, 45, 20, 5), color)); break;
      case 'heart': svg.appendChild(path('M50 85 C10 55 10 20 35 15 C48 12 50 25 50 25 C50 25 52 12 65 15 C90 20 90 55 50 85 Z', color)); break;
      default:
        throw new Error('VT.Stim.shape: 未知のshape "' + shape + '"');
    }
    return svg;
  };

  VT.Stim = Stim;
})();
