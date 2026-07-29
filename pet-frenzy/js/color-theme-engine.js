/*!
 * color-theme-engine.js  —  種子色自動配色引擎（純函式，無 UI、無 DOM 依賴）
 *
 * 用途：
 *   畫布只需要指定「一顆背景顏色」（側欄「背景顏色」色票／Excel 工單「背景色碼」欄位），
 *   這支引擎會自動推算出主標／副標／日期文字色、LOGO分隔線顏色、地平線陰影色，
 *   以及 LOGO／CTA 該用橘色版還是白色版。
 *
 *   背景顏色來源（兩者都會呼叫同一份 generateFromSeed()，邏輯保證一致）：
 *     ① 側欄「背景顏色」色票手動選色
 *     ② Excel 工單「背景色碼」欄位（見 editor-import.js 的 bgColor 欄位）
 *
 * ── 可調參數集中在這裡（THEME_ENGINE_CONFIG），要微調配色行為只改這裡 ──
 *
 * 對外 API（window.ColorThemeEngine）：
 *   generateFromSeed(seedHex) → { cSub, cMain, cDate, sepColor, logo1, cta, shadowColor, shadowRgba, barColor, isMidTone }
 *   pickLogoAssets(seedHex)   → { logo1, cta, isWhite }
 *   pickBarColor(seedHex)     → 主持人 Bar 底色 hex（2026-07-28 新增）
 *   getLuminance(hex), contrastRatio(hexA, hexB)
 */
(function (global) {
  'use strict';

  /* ════════════════════════════════════════════════════════
     §0. 可調參數（唯一集中處，其他地方不要重複寫死這些數字）
     ════════════════════════════════════════════════════════ */
  var THEME_ENGINE_CONFIG = {
    /* 亮／暗背景分界（W3C 相對亮度 0~1）：
       > lightThreshold → 亮背景，文字壓暗
       < darkThreshold  → 暗背景，文字提亮
       中間 → 雙向試探取對比較高者                         */
    lightThreshold: 0.35,
    darkThreshold:  0.12,

    /* LOGO／CTA 橘色版 vs 白色版的切換門檻：
       種子色亮度 < 此值 → 用白色版（深背景上橘色看不清楚）*/
    logoLumThreshold: 0.38,

    /* 對比度目標（WCAG 相對比值） */
    contrastTarget:  4.5,   // 一般（亮/暗背景路徑）
    contrastMidTone: 3.0,   // 中間色調路徑，門檻降低避免調不出色

    /* 文字飽和度下限，避免調到死灰色 */
    minSaturation: 42,

    /* 低飽和度（灰階）種子色時，錨定這個色相（220 = 蝦皮品牌藍） */
    grayFallbackHue: 220,
    graySaturationThreshold: 15,

    /* 副標色相偏移（度數），往相近色偏讓主副標產生差異，正值=順時針、負值=逆時針；
       0 = 不偏移（跟主標同色相），-20 = 往相近色偏，建議範圍 -30~+30 */
    subHueShift: -20,

    /* 品牌色（sepColor／CTA 底色走橘色版時使用） */
    brandOrange: '#EE4D2D',

    /* 主持人 Bar 底色（2026-07-28 跟 Iona 確認新增）：跟種子色同色相，走一組獨立的
       深淺邏輯——Bar 上的文字目前固定白色，所以只要求 Bar 底色本身對「白色文字」
       維持足夠對比，不像 cMain/cSub 那樣要跟著背景亮暗切換方向。
       barBaseLightness：起始 HSL 亮度（0~100），越小越深；
       barContrastTarget：Bar 底色跟白色文字的最低對比值（WCAG 相對比值）——
       原本寫死的 #dd447d 對白色文字約 4.04，這裡抓 4.0 當底線，盡量貼近原本視覺深淺。 */
    barBaseLightness: 42,
    barContrastTarget: 4.0,

    /* LOGO 資源檔名（相對於 editor.html） */
    logoOrangePath: 'logos/logo_shopee_live.png',
    logoWhitePath:  'logos/logo_shopee_live_white.png',
    ctaOrangePath:  'logos/cta_btn.png',
    ctaWhitePath:   'logos/cta_btn_white.png',
  };

  /* ════════════════════════════════════════════════════════
     §1. Color Math（沿用既有配色演算法，未更動核心公式）
     ════════════════════════════════════════════════════════ */

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    var h = hex.replace(/^#/, '').trim();
    var f = h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h;
    if (!/^[0-9A-Fa-f]{6}$/.test(f)) return null;
    return { r: parseInt(f.substr(0,2),16), g: parseInt(f.substr(2,2),16), b: parseInt(f.substr(4,2),16) };
  }

  function rgbToHex(r, g, b) {
    var c = function(v){ return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0'); };
    return '#' + c(r) + c(g) + c(b);
  }

  function rgbToHsl(r, g, b) {
    r/=255; g/=255; b/=255;
    var max=Math.max(r,g,b), min=Math.min(r,g,b);
    var l=(max+min)/2, h=0, s=0;
    if (max!==min) {
      var d=max-min;
      s = l>.5 ? d/(2-max-min) : d/(max+min);
      switch(max) {
        case r: h=((g-b)/d+(g<b?6:0))/6; break;
        case g: h=((b-r)/d+2)/6; break;
        case b: h=((r-g)/d+4)/6; break;
      }
    }
    return { h: h*360, s: s*100, l: l*100 };
  }

  function hslToHex(h, s, l) {
    h = ((h%360)+360)%360;
    s = Math.max(0, Math.min(100,s));
    l = Math.max(0, Math.min(100,l));
    h/=360; s/=100; l/=100;
    var r, g, b;
    if (s<.001) { r=g=b=l; }
    else {
      var hue2rgb = function(p,q,t) {
        if(t<0)t+=1; if(t>1)t-=1;
        if(t<1/6) return p+(q-p)*6*t;
        if(t<.5)  return q;
        if(t<2/3) return p+(q-p)*(2/3-t)*6;
        return p;
      };
      var q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return rgbToHex(r*255, g*255, b*255);
  }

  function getLuminance(hex) {
    var rgb = hexToRgb(hex); if (!rgb) return 0;
    var lin = function(c){ c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); };
    return .2126*lin(rgb.r) + .7152*lin(rgb.g) + .0722*lin(rgb.b);
  }

  function contrastRatio(hex1, hex2) {
    var a=getLuminance(hex1)+.05, b=getLuminance(hex2)+.05;
    return parseFloat((Math.max(a,b)/Math.min(a,b)).toFixed(2));
  }

  function hexToRgba(hex, alpha) {
    var rgb = hexToRgb(hex); if (!rgb) return 'rgba(0,0,0,'+alpha+')';
    return 'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+alpha+')';
  }

  /** 調整文字色直到對背景達到 minRatio；l 限制 12–88%，s 強制 ≥ minSaturation */
  function ensureContrast(textHex, bgHex, minRatio) {
    if (contrastRatio(textHex, bgHex) >= minRatio) return textHex;
    var bgLum = getLuminance(bgHex);
    var darken = bgLum > .179;
    var rgb = hexToRgb(textHex); if (!rgb) return darken ? '#1a1a1a' : '#e5e5e5';
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var s = Math.max(hsl.s, THEME_ENGINE_CONFIG.minSaturation);
    for (var i=0; i<28; i++) {
      hsl.l = darken ? Math.max(hsl.l-3, 12) : Math.min(hsl.l+3, 88);
      var c = hslToHex(hsl.h, s, hsl.l);
      if (contrastRatio(c, bgHex) >= minRatio) return c;
    }
    return hslToHex(hsl.h, s, darken ? 12 : 88);
  }

  /* ════════════════════════════════════════════════════════
     §2. 種子色 → 全套配色
     ════════════════════════════════════════════════════════ */

  function generateFromSeed(seedHex) {
    var cfg = THEME_ENGINE_CONFIG;
    var rgb = hexToRgb(seedHex);
    if (!rgb) return null;
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var h = hsl.h, s = hsl.s, l = hsl.l;
    var lum = getLuminance(seedHex);

    var ha = s < cfg.graySaturationThreshold ? cfg.grayFallbackHue : h;
    var sB = Math.max(s + 22, 55);

    var mainText, subText, isMidTone = false;
    var hSub = (ha + cfg.subHueShift + 360) % 360; // 偏移色相給主標大字（cMain→畫布副標70px）

    if (lum > cfg.lightThreshold) {
      /* 亮背景：壓暗 */
      mainText = ensureContrast(hslToHex(hSub, Math.min(sB+8, 88), 20), seedHex, cfg.contrastTarget);
      subText  = ensureContrast(hslToHex(ha,   Math.min(sB,   80), 30), seedHex, cfg.contrastTarget);
    } else if (lum < cfg.darkThreshold) {
      /* 暗背景：提亮 */
      mainText = ensureContrast(hslToHex(hSub, Math.min(s+12, 75), 82), seedHex, cfg.contrastTarget);
      subText  = ensureContrast(hslToHex(ha,   Math.min(s+5,  68), 72), seedHex, cfg.contrastTarget);
    } else {
      /* 中間色調：雙向試探，取對比較高方向 */
      isMidTone = true;
      var dMain = ensureContrast(hslToHex(hSub, Math.min(sB,   85), 14), seedHex, cfg.contrastMidTone);
      var lMain = ensureContrast(hslToHex(hSub, Math.min(s+8,  70), 86), seedHex, cfg.contrastMidTone);
      if (contrastRatio(lMain, seedHex) >= contrastRatio(dMain, seedHex)) {
        mainText = lMain;
        subText  = ensureContrast(hslToHex(ha, Math.min(s+4, 62), 78), seedHex, cfg.contrastMidTone);
      } else {
        mainText = dMain;
        subText  = ensureContrast(hslToHex(ha, Math.min(sB-5, 78), 22), seedHex, cfg.contrastMidTone);
      }
    }

    var logoPick = pickLogoAssets(seedHex);

    /* LOGO分隔線：跟 LOGO 深淺配對走同一組門檻——白色LOGO配白線，橘色LOGO配品牌橘線 */
    var sepColor = logoPick.isWhite ? '#FFFFFF' : cfg.brandOrange;

    /* 地平線陰影色：跟主副標文字用同一組亮/暗背景判斷（isMidTone 那條線也共用），
       差別在於文字是「跟背景拉開對比才看得見」，陰影則是「跟背景同色系但更深/更淺一階」：
         亮背景 → 壓暗（傳統地面陰影，跟阿謙原本的做法一樣）
         暗背景 → 改成提亮（做成一圈淺色的「地面反光」，不然比背景更暗會完全看不見）
         中間色調 → 跟文字用同一次雙向試探結果，往同一個方向走（暗字配亮陰影或反過來都很怪）
       這樣才能跟文字色一樣「換了背景顏色，跟著換成合理的深淺方向」，而不是永遠只會變暗。 */
    var shadowSat = Math.min(sB, 65);
    var shadowLight;
    if(lum > cfg.lightThreshold){
      shadowLight = Math.max(l * 0.45, 18);
    } else if(lum < cfg.darkThreshold){
      shadowLight = Math.min(l + (100 - l) * 0.45, 82);
    } else {
      // 中間色調：往跟文字同一個方向（文字選了淺色代表這個背景視覺上偏「暗」那一側，陰影也跟著提亮）
      var textWentLight = getLuminance(subText) > lum;
      shadowLight = textWentLight ? Math.min(l + (100-l)*0.5, 80) : Math.max(l*0.5, 20);
    }
    var shadowColor = hslToHex(ha, shadowSat, shadowLight);
    var shadowRgba = hexToRgba(shadowColor, 0.32);

    return {
      cSub:  subText,
      cMain: mainText,
      cDate: mainText,
      sepColor:     sepColor,
      logo1: logoPick.logo1,
      cta:   logoPick.cta,
      shadowColor: shadowColor,
      shadowRgba:  shadowRgba,
      barColor: pickBarColor(seedHex),
      isMidTone: isMidTone,
    };
  }

  /* ════════════════════════════════════════════════════════
     §3. LOGO／CTA 深淺挑選
     ════════════════════════════════════════════════════════ */

  function pickLogoAssets(seedHex) {
    var cfg = THEME_ENGINE_CONFIG;
    var isWhite = getLuminance(seedHex) < cfg.logoLumThreshold;
    return {
      logo1: isWhite ? cfg.logoWhitePath : cfg.logoOrangePath,
      cta:   isWhite ? cfg.ctaWhitePath  : cfg.ctaOrangePath,
      isWhite: isWhite,
    };
  }

  /* 主持人 Bar 底色（2026-07-28 跟 Iona 確認新增）：獨立一組配色，不跟 sepColor
     共用——用種子色的色相（灰階時錨定品牌藍），飽和度拉高一點更飽和，起始亮度
     固定偏深（barBaseLightness），再用 ensureContrast() 確保跟固定的白色文字
     維持最低對比，不夠深就繼續壓暗。跟 cMain/cSub 不同的地方是：這裡不管背景
     本身亮或暗，一律只針對「白色文字讀得清楚」這一個目標去調，因為 Bar 是一塊
     獨立色塊，不是全版背景。 */
  function pickBarColor(seedHex) {
    var cfg = THEME_ENGINE_CONFIG;
    var rgb = hexToRgb(seedHex);
    if (!rgb) return '#dd447d';
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var ha = hsl.s < cfg.graySaturationThreshold ? cfg.grayFallbackHue : hsl.h;
    var sBar = Math.max(Math.min(hsl.s + 20, 82), 58);
    var candidate = hslToHex(ha, sBar, cfg.barBaseLightness);
    return ensureContrast(candidate, '#ffffff', cfg.barContrastTarget);
  }

  /* ════════════════════════════════════════════════════════
     §4. hex 格式驗證（供工單自動偵測／手動輸入共用）
     ════════════════════════════════════════════════════════ */
  function normalizeHex(input) {
    if (!input) return null;
    var v = String(input).trim();
    var plain = v.replace(/^#+/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(plain)) return ('#' + plain).toUpperCase();
    if (/^[0-9A-Fa-f]{3}$/.test(plain)) {
      return ('#' + plain[0]+plain[0]+plain[1]+plain[1]+plain[2]+plain[2]).toUpperCase();
    }
    var m = v.match(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/);
    if (m) {
      var hx = m[1];
      if (hx.length === 3) hx = hx[0]+hx[0]+hx[1]+hx[1]+hx[2]+hx[2];
      return ('#' + hx).toUpperCase();
    }
    return null;
  }

  global.ColorThemeEngine = {
    config: THEME_ENGINE_CONFIG,
    generateFromSeed: generateFromSeed,
    pickLogoAssets: pickLogoAssets,
    pickBarColor: pickBarColor,
    getLuminance: getLuminance,
    contrastRatio: contrastRatio,
    normalizeHex: normalizeHex,
  };

})(window);
