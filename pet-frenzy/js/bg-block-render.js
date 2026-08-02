/*!
 * bg-block-render.js
 * ────────────────────────────────────────────────────────────
 * 「底色吸取」共用背景畫法（毛孩衝蝦米新增，02_lpbn／01_thumbnail／05_opening 共用）。
 *
 * 對外只有一個函式：
 *   window.BgBlockRender.draw(ctx, W, H, seedHex, layoutKey)
 *
 * 邏輯：
 *   1. 深色（底色＝seedHex 本身）永遠不變；淺色（色塊）怎麼混，依 seedHex 本身的亮度
 *      分兩種情況（2026-08-02 跟 Iona 確認新增）：
 *        種子色亮度 ≤ 0.35（沿用 color-theme-engine.js 的 lightThreshold，跟主標亮/暗背景
 *        判斷門檻一致）→ 淺＝seedHex 混 15% 白色（原本的做法）
 *        種子色亮度 > 0.35（種子色本身已經很淺）→ 淺＝seedHex 走 HSL 降 lightness 8、
 *        saturation 補 0（darkenVivid，2026-08-02 跟 Iona 確認先拿掉飽和度補正看效果，
 *        lightness 降幅原本 15 先調淡成 8，之後視覺上覺得太濁/太淡再調），避免色塊
 *        繼續往白色混到快跟白背景分不出來——底色本身完全不受影響，跟主標 cMain/cSub
 *        依背景亮暗翻轉調色方向、且用 HSL 動 l/s 是同一個概念，但這裡只有淺側會變
 *   2. 依 window.BgBlockDefaults[layoutKey] 的 line/darkSide 參數，把畫布切成兩塊三角形／
 *      梯形，深淺各填一塊——用 Sutherland-Hodgman 半平面裁切矩形，不管線是穿過上下緣
 *      還是左右緣都通用，不用另外寫兩套邏輯
 *   3. 疊上 wash（單方向漸層不透明度刷色，色用「深色」本身，疊在整張畫布上——反正深色區
 *      疊深色不會有視覺差異，只有淺色區看得出來變深）
 *   4. layoutKey 不在 BgBlockDefaults 清單裡（07_fl／09_tab）：純色填底，直接用 seedHex，
 *      不做斜切/刷色——07_fl／09_tab 各自的 render() 不會呼叫這支，這條只是保險 fallback
 *
 * 顏色計算沒有另外抽 color-theme-engine.js 的函式，因為那邊是全套配色（含文字色/陰影色），
 * 這裡只需要「seed→淺色/深色」這幾步，直接用 color-theme-engine.js 已經 expose 的 hex↔rgb
 * 工具會增加耦合，所以在這支檔案裡自己重寫一份簡單版（hexToRgb/rgbToHex/rgbToHsl/hslToHex/
 * mixWhite/darkenVivid/getLuminance）。LIGHT_THRESHOLD 的 0.35 是手動抄一份數字過來對齊，
 * 不是 import 引擎的 config，兩邊之後如果要調整亮/暗門檻要記得一起改。
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
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s));
    l = Math.max(0, Math.min(100, l));
    h /= 360; s /= 100; l /= 100;
    var r, g, b;
    if (s < .001) { r = g = b = l; }
    else {
      var hue2rgb = function (p, q, t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < .5) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
  }
  /* 走 HSL 降 lightness＋補 saturation，取代直接混黑——RGB 混黑亮度雖然降了，
     視覺上會偏濁；這裡跟 color-theme-engine.js 的 ensureContrast() 同一招，用 HSL
     動 l 同時把 s 往上補一點，深色但保持鮮豔（2026-08-02 跟 Iona 確認：l 降 15，s 補 5） */
  function darkenVivid(hex, lDrop, sBoost) {
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.l = Math.max(hsl.l - lDrop, 8);
    hsl.s = Math.min(hsl.s + sBoost, 100);
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }
  function hexToRgba(hex, a) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }
  /* W3C 相對亮度，公式跟 color-theme-engine.js 的 getLuminance 一致（沒有直接 import，
     避免耦合，見檔頭說明） */
  function getLuminance(hex) {
    var rgb = hexToRgb(hex);
    var lin = function (c) { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    return .2126 * lin(rgb.r) + .7152 * lin(rgb.g) + .0722 * lin(rgb.b);
  }
  /* 種子色亮/暗分界，要跟 color-theme-engine.js 的 THEME_ENGINE_CONFIG.lightThreshold 保持一致 */
  var LIGHT_THRESHOLD = 0.35;
  /* 色塊變深時的 HSL 調整量（2026-08-02 跟 Iona 確認） */
  var DARKEN_L_DROP = 8;
  var DARKEN_S_BOOST = 0;

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
    var seed = seedHex || '#0D3165';
    /* 底色（dark）永遠是 seedHex 本身，不因種子色亮暗而改變——
       只有色塊（light，原本混白那側）在種子色本身已經很淺時，改成混黑，
       避免繼續往白色混到快跟底色分不出來 */
    var dark = seed;
    var light = getLuminance(seed) > LIGHT_THRESHOLD ? darkenVivid(seed, DARKEN_L_DROP, DARKEN_S_BOOST) : mixWhite(seed, 0.15);

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

  global.BgBlockRender = {
    draw: draw,
    mixWhite: mixWhite,
    darkenVivid: darkenVivid,
    getLuminance: getLuminance,
    hexToRgba: hexToRgba,
    LIGHT_THRESHOLD: LIGHT_THRESHOLD,
    DARKEN_L_DROP: DARKEN_L_DROP,
    DARKEN_S_BOOST: DARKEN_S_BOOST
  };

})(window);
