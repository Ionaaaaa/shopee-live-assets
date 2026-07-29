/*!
 * bg-block-render.js
 * ────────────────────────────────────────────────────────────
 * 「底色吸取」共用背景畫法（毛孩衝蝦米新增，02_lpbn／01_thumbnail／05_opening 共用）。
 *
 * 對外只有一個函式：
 *   window.BgBlockRender.draw(ctx, W, H, seedHex, layoutKey)
 *
 * 邏輯：
 *   1. 深色＝seedHex 本身，淺色＝seedHex 混 15% 白色（跟三張參考圖量出來的公式一致）
 *   2. 依 window.BgBlockDefaults[layoutKey] 的 line/darkSide 參數，把畫布切成兩塊三角形／
 *      梯形，深淺各填一塊——用 Sutherland-Hodgman 半平面裁切矩形，不管線是穿過上下緣
 *      還是左右緣都通用，不用另外寫兩套邏輯
 *   3. 疊上 wash（單方向漸層不透明度刷色，色用「深色」本身，疊在整張畫布上——反正深色區
 *      疊深色不會有視覺差異，只有淺色區看得出來變深）
 *   4. layoutKey 不在 BgBlockDefaults 清單裡（07_fl／09_tab）：純色填底，直接用 seedHex，
 *      不做斜切/刷色——07_fl／09_tab 各自的 render() 不會呼叫這支，這條只是保險 fallback
 *
 * 顏色計算沒有另外抽 color-theme-engine.js 的函式，因為那邊是全套配色（含文字色/陰影色），
 * 這裡只需要「seed→淺色」這一步，直接用 color-theme-engine.js 已經 expose 的 hex↔rgb 工具會
 * 增加耦合，所以在這支檔案裡自己重寫一份簡單版（只有 hexToRgb/rgbToHex/mix 三個小函式）。
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  function hexToRgb(hex) {
    var h = String(hex || '').replace(/^#/, '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    var c = function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); };
    return '#' + c(r) + c(g) + c(b);
  }
  function mixWhite(hex, t) {
    var rgb = hexToRgb(hex);
    return rgbToHex(rgb.r + (255 - rgb.r) * t, rgb.g + (255 - rgb.g) * t, rgb.b + (255 - rgb.b) * t);
  }
  function hexToRgba(hex, a) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }

  /* ── Sutherland-Hodgman：把矩形四角依半平面裁切成一塊多邊形 ──
     insideTest(pt) 回傳 true 代表這個點在「要保留」的那一側 */
  function clipRect(W, H, insideTest) {
    var poly = [{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}];
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var cur = poly[i], prev = poly[(i - 1 + poly.length) % poly.length];
      var curIn = insideTest(cur), prevIn = insideTest(prev);
      if (curIn) {
        if (!prevIn) out.push(segIntersect(prev, cur, insideTest));
        out.push(cur);
      } else if (prevIn) {
        out.push(segIntersect(prev, cur, insideTest));
      }
    }
    return out;
  }
  /* 二分逼近線段跟半平面邊界的交點（矩形邊 vs 任意斜線都通用，不用解析解） */
  function segIntersect(a, b, insideTest) {
    var lo = 0, hi = 1, aIn = insideTest(a);
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      var p = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
      if (insideTest(p) === aIn) lo = mid; else hi = mid;
    }
    var t = (lo + hi) / 2;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function fillPoly(ctx, poly, fillStyle) {
    if (!poly.length) return;
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx, W, H, seedHex, layoutKey) {
    var cfg = global.BgBlockDefaults && global.BgBlockDefaults[layoutKey];
    var dark = seedHex || '#0D3165';
    var light = mixWhite(dark, 0.15);

    if (!cfg) {
      /* 07_fl／09_tab 或未設定的版位：純色填底 */
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    var p1 = { x: cfg.line.x1 / 100 * W, y: cfg.line.y1 / 100 * H };
    var p2 = { x: cfg.line.x2 / 100 * W, y: cfg.line.y2 / 100 * H };
    var d = { x: p2.x - p1.x, y: p2.y - p1.y };
    var signMap = { left: 1, top: 1, right: -1, bottom: -1 };
    var sign = signMap[cfg.darkSide] || 1;

    function isDark(pt) {
      var cross = d.x * (pt.y - p1.y) - d.y * (pt.x - p1.x);
      return sign * cross >= 0;
    }

    var darkPoly = clipRect(W, H, isDark);
    var lightPoly = clipRect(W, H, function (pt) { return !isDark(pt); });

    ctx.save();
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    fillPoly(ctx, darkPoly, dark);
    ctx.restore();

    /* wash：單方向漸層不透明度刷色，色用深色本身 */
    if (cfg.wash) {
      var w = cfg.wash;
      var grad;
      if (w.axis === 'x') {
        grad = ctx.createLinearGradient(W * w.from / 100, 0, W * w.to / 100, 0);
      } else {
        grad = ctx.createLinearGradient(0, H * w.from / 100, 0, H * w.to / 100);
      }
      grad.addColorStop(0, hexToRgba(dark, 0));
      grad.addColorStop(1, hexToRgba(dark, w.maxOpacity));
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  global.BgBlockRender = { draw: draw, mixWhite: mixWhite, hexToRgba: hexToRgba };

})(window);
