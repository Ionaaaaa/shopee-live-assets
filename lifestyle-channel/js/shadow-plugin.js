/*
  ShadowPlugin v3
  - 商品(product)：貼地陰影（原本的斜切/擠壓效果），參數固定好，不對外開放調整，只留光源角度可切換
  - 代言人(person)：光暈陰影（不倒地、後方縮小微變形+模糊），允許超出畫布下緣
*/
window.ShadowPlugin = (function () {
  'use strict';

  // ---- 固定死的預設值（不對外開放調整）----
  var FIXED = {
    soft: 16,
    fade: 120,
    occlude: 80,
    squash: 0.32
  };
  var ANGLE_PRESETS = { left: -35, top: 0, right: 35 };

  var opts = { angle: ANGLE_PRESETS.left, topY: null, bottomY: null };
  var products = {}; // id -> { img, silhouette, tinted, trim, type }
  var shadowRGB = '90,90,90';
  var fixedColor = false;

  function setAngle(preset) {
    if (typeof preset === 'number') { opts.angle = preset; return; }
    if (ANGLE_PRESETS[preset] != null) opts.angle = ANGLE_PRESETS[preset];
  }
  function configureZone(topY, bottomY) { opts.topY = topY; opts.bottomY = bottomY; }

  function setShadowColorRGB(rgbStr) {
    shadowRGB = rgbStr; fixedColor = true;
    Object.keys(products).forEach(function (id) { tintProduct(id); });
  }
  function getShadowColorRGB() { return shadowRGB; }
  function unlockShadowColor() { fixedColor = false; }

  function setBackground(bgImg) {
    if (fixedColor) return;
    if (!bgImg || !bgImg.naturalWidth) return;
    try {
      var c = document.createElement('canvas');
      c.width = 40; c.height = 40;
      var cctx = c.getContext('2d');
      var sampleH = Math.max(1, Math.floor(bgImg.naturalHeight * 0.35));
      cctx.drawImage(bgImg, 0, bgImg.naturalHeight - sampleH, bgImg.naturalWidth, sampleH, 0, 0, 40, 40);
      var d = cctx.getImageData(0, 0, 40, 40).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      r = (r / n) * 0.8; g = (g / n) * 0.8; b = (b / n) * 0.8;
      shadowRGB = Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b);
    } catch (e) {
      console.warn('ShadowPlugin.setBackground: 無法取樣背景顏色，改用預設色', e);
    }
    Object.keys(products).forEach(function (id) { tintProduct(id); });
  }

  function buildSilhouette(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function tintProduct(id) {
    var p = products[id];
    if (!p || !p.silhouette) return;
    var tinted = document.createElement('canvas');
    tinted.width = p.silhouette.width; tinted.height = p.silhouette.height;
    var tctx = tinted.getContext('2d');
    tctx.drawImage(p.silhouette, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = 'rgb(' + shadowRGB + ')';
    tctx.fillRect(0, 0, tinted.width, tinted.height);
    p.tinted = tinted;
  }

  function detectAlphaTrim(img) {
    var c = document.createElement('canvas');
    var maxDim = 300;
    var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    c.width = w; c.height = h;
    var cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0, w, h);
    var top = 0, bottom = 0;
    try {
      var d = cctx.getImageData(0, 0, w, h).data;
      var minY = h, maxY = -1;
      var alphaThresh = 10;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var a = d[(y * w + x) * 4 + 3];
          if (a > alphaThresh) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            break;
          }
        }
      }
      if (maxY >= 0) { top = minY / h; bottom = (h - 1 - maxY) / h; }
    } catch (e) {
      console.warn('ShadowPlugin: 無法偵測透明留白，影子支點改用圖片原始底邊', e);
    }
    return { top: top, bottom: bottom };
  }

  // type: 'product'（貼地陰影，預設） 或 'person'（光暈陰影，可超出畫布下緣）
  function registerProduct(id, imgEl, type) {
    return new Promise(function (resolve) {
      function build() {
        var silhouette = buildSilhouette(imgEl);
        var trim = detectAlphaTrim(imgEl);
        products[id] = { img: imgEl, silhouette: silhouette, tinted: null, trim: trim, type: type || 'product' };
        tintProduct(id);
        resolve(products[id]);
      }
      if (imgEl.complete && imgEl.naturalWidth) build();
      else imgEl.onload = build;
    });
  }

  function removeProduct(id) { delete products[id]; }
  function getType(id) { return products[id] ? products[id].type : null; }

  function stampLayer(targetCtx, tinted, ox, oy, pw, ph, shear, squash, spread, totalAlpha, samples) {
    if (!tinted) return;
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'multiply';
    targetCtx.globalAlpha = totalAlpha / samples;
    for (var i = 0; i < samples; i++) {
      var ang = (i / samples) * Math.PI * 2 * 2.4;
      var rad = spread * Math.sqrt((i + 0.5) / samples);
      var dx = Math.cos(ang) * rad;
      var dy = Math.sin(ang) * rad * 0.4;
      targetCtx.save();
      targetCtx.translate(ox + dx, oy + dy);
      targetCtx.transform(1, 0, shear, squash, 0, 0);
      targetCtx.drawImage(tinted, -pw / 2, -ph, pw, ph);
      targetCtx.restore();
    }
    targetCtx.restore();
  }

  // ---- 商品：貼地陰影（原本效果，參數已固定） ----
  function drawGroundShadow(ctx, id, state, occluderMask, skipPhoto) {
    var p = products[id];
    if (!p || !p.tinted) return;

    var pw = state.w, ph = state.h;
    var cx = state.x;
    var trimBottomPad = p.trim ? p.trim.bottom * ph : 0;
    var py = state.y + trimBottomPad;

    var angle = opts.angle * Math.PI / 180;
    var soft = FIXED.soft;
    var fadeMul = FIXED.fade / 100;
    var occludeStrength = FIXED.occlude / 100;
    var shear = Math.tan(angle * 0.55);
    var squash = FIXED.squash;
    var maxSpread = soft * 1.8;

    var halfW = pw / 2 + Math.abs(shear) * ph + maxSpread * 2 + 20;
    var tempW = Math.ceil(halfW * 2);
    var tempH = Math.ceil(ph * squash * 2 + maxSpread * 2 + 40);
    var anchorX = halfW;
    var anchorY = Math.ceil(tempH * 0.5);

    var tmp = document.createElement('canvas');
    tmp.width = tempW; tmp.height = tempH;
    var tctx = tmp.getContext('2d');

    stampLayer(tctx, p.tinted, anchorX, anchorY, pw, ph, shear, squash, soft * 1.8, 0.28, 12);
    stampLayer(tctx, p.tinted, anchorX, anchorY, pw, ph, shear, squash, soft * 0.8, 0.4, 10);
    stampLayer(tctx, p.tinted, anchorX, anchorY, pw, ph, shear, squash, soft * 0.25, 0.35, 6);

    if (occludeStrength > 0 && occluderMask) {
      tctx.save();
      tctx.globalCompositeOperation = 'destination-out';
      tctx.globalAlpha = occludeStrength;
      tctx.drawImage(occluderMask, -(cx - anchorX), -(py - anchorY));
      tctx.restore();
    }

    var tipX = -shear * ph * fadeMul;
    var tipY = -squash * ph * fadeMul - soft * 0.6;
    tctx.globalCompositeOperation = 'destination-in';
    var grad = tctx.createLinearGradient(anchorX, anchorY, anchorX + tipX, anchorY + tipY);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, tempW, tempH);
    tctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(tmp, cx - anchorX, py - anchorY);
    ctx.restore();

    if (!skipPhoto && p.img.complete && p.img.naturalWidth) {
      ctx.drawImage(p.img, cx - pw / 2, py - ph, pw, ph);
    }
  }

  // ---- 代言人：光暈陰影（不倒地、後方縮小+微變形+模糊，可超出畫布下緣；跟隨主光源方向；碰到商品變透明） ----
  function drawPersonGlow(ctx, id, state, occluderMask, skipPhoto) {
    var p = products[id];
    if (!p || !p.silhouette) return;

    var pw = state.w, ph = state.h;
    var cx = state.x;
    var trimBottomPad = p.trim ? p.trim.bottom * ph : 0;
    var py = state.y + trimBottomPad;

    var angle = opts.angle * Math.PI / 180;
    var shear = Math.tan(angle * 0.55);

    var glowScale = 0.93;
    var offsetX = -shear * ph * 0.08;  // 離人物更近一點
    var offsetY = ph * 0.018 + Math.abs(shear) * ph * 0.008;
    var deformX = 0.97, deformY = 1.03;
    var blurPx = Math.max(6, Math.round(pw * 0.035)); // 更模糊
    var alpha = 0.24; // 更淡

    var gw = pw * glowScale * deformX;
    var gh = ph * glowScale * deformY;
    var gx = cx + offsetX;
    var gy = py + offsetY;

    var tmp = document.createElement('canvas');
    tmp.width = ctx.canvas.width; tmp.height = ctx.canvas.height;
    var tctx = tmp.getContext('2d');
    tctx.filter = 'blur(' + blurPx + 'px)';
    tctx.globalAlpha = alpha;
    tctx.drawImage(p.silhouette, gx - gw / 2, gy - gh, gw, gh);
    tctx.filter = 'none';

    if (occluderMask) {
      tctx.globalAlpha = 1;
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(occluderMask, 0, 0);
      tctx.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(tmp, 0, 0);

    if (!skipPhoto && p.img.complete && p.img.naturalWidth) {
      ctx.drawImage(p.img, cx - pw / 2, py - ph, pw, ph);
    }
  }

  function drawItem(ctx, id, state, occluderMask, skipPhoto) {
    var type = getType(id);
    if (type === 'person') drawPersonGlow(ctx, id, state, occluderMask, skipPhoto);
    else drawGroundShadow(ctx, id, state, occluderMask, skipPhoto);
  }


  function renderScene(ctx, items, skipPhoto) {
    // 給「代言人光暈」用的完整遮罩：所有商品 + 所有代言人本身的輪廓都算進去，
    // 這樣不管是碰到商品、還是兩個代言人互相重疊，重疊處的光暈都會消失
    var personGlowMask = document.createElement('canvas');
    personGlowMask.width = ctx.canvas.width;
    personGlowMask.height = ctx.canvas.height;
    var pgctx = personGlowMask.getContext('2d');
    items.forEach(function (state) {
      var p = products[state.id];
      if (p && p.silhouette) {
        var pad = p.trim ? p.trim.bottom * state.h : 0;
        var py = state.y + pad;
        pgctx.drawImage(p.silhouette, state.x - state.w / 2, py - state.h, state.w, state.h);
      }
    });

    // 給「商品貼地陰影」用的遮罩：沿用原本邏輯，只有已經畫過的商品才會擋住後面商品的陰影
    var runningMask = document.createElement('canvas');
    runningMask.width = ctx.canvas.width;
    runningMask.height = ctx.canvas.height;
    var rmctx = runningMask.getContext('2d');

    // 疊放順序：直接尊重呼叫端給的陣列順序（陣列前面＝後方，後面＝前方），
    // 方便外部提供「手動拖曳排序的圖層清單」；不再自動依 Y 座標排序，
    // 避免身形較高/較長的人物因為錨點 Y 值大就一律被排到最前面。
    var order = items;
    order.forEach(function (state) {
      var p = products[state.id];
      var isPerson = p && p.type === 'person';
      drawItem(ctx, state.id, state, isPerson ? personGlowMask : runningMask, skipPhoto);
      if (p && p.silhouette && !isPerson) {
        var pad = p.trim ? p.trim.bottom * state.h : 0;
        var py = state.y + pad;
        rmctx.drawImage(p.silhouette, state.x - state.w / 2, py - state.h, state.w, state.h);
      }
    });
  }

  // 只畫商品/主持人照片本體，完全不含陰影效果（給匯出時分層合成用，
  // 避免用「去背景色算透明度」的方式處理陰影時，連帶把照片裡的淺色/白色內容也誤判成透明）
  function renderPhotosOnly(ctx, items) {
    items.forEach(function (state) {
      var p = products[state.id];
      if (!p || !p.img || !p.img.complete || !p.img.naturalWidth) return;
      var pw = state.w, ph = state.h;
      var cx = state.x;
      var trimBottomPad = p.trim ? p.trim.bottom * ph : 0;
      var py = state.y + trimBottomPad;
      ctx.drawImage(p.img, cx - pw / 2, py - ph, pw, ph);
    });
  }

  return {
    ANGLE_PRESETS: ANGLE_PRESETS,
    setAngle: setAngle,
    configureZone: configureZone,
    setBackground: setBackground,
    setShadowColorRGB: setShadowColorRGB,
    getShadowColorRGB: getShadowColorRGB,
    unlockShadowColor: unlockShadowColor,
    registerProduct: registerProduct,
    removeProduct: removeProduct,
    getType: getType,
    renderScene: renderScene,
    renderPhotosOnly: renderPhotosOnly,
    _products: products
  };
})();
