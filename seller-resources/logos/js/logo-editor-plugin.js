/*!
 * Logo Menu Plugin v14
 * 從 hbn.html jimmy-new-logo-menu-only-script 抽取
 * 提供：logo 縮圖右上角 ✎ 觸發器 + 下拉選單（編輯/往右移/刪除/加圓角）
 *       + CropperJS Logo 裁切 Modal
 *
 * 使用：
 *   window.BNLogoMenu.attach(imgEl, options)
 *     options.onEdit(imgEl)    → 點「編輯」
 *     options.onSwap(imgEl)    → 點「往右移」（可選）
 *     options.onDelete(imgEl)  → 點「刪除」
 *     options.showSwap         → 是否顯示「往右移」
 *
 *   window.BNLogoMenu.openCropEditor(src, onDone)
 *     → 開啟 CropperJS 裁切視窗，完成後呼叫 onDone(newSrc)
 */
(function(global){
  if(global.__BN_LOGO_MENU_PLUGIN__) return;
  global.__BN_LOGO_MENU_PLUGIN__ = true;

  /* ── 載入 CropperJS ── */
  function loadCropper(cb){
    if(global.Cropper){ cb(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css';
    document.head.appendChild(link);
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /* ── 注入 CSS ── */
  function injectCSS(){
    if(document.getElementById('_bn_lm_css')) return;
    var s = document.createElement('style');
    s.id = '_bn_lm_css';
    s.textContent = "<style id=\"jimmy-new-logo-menu-only-style\">\n.logo-edit-btn,\n.logo-swap-btn,\n.logo-delete-btn,\n.logo-white-btn,\n.logo-main-pen-btn,\n.logo-action-menu{\n  display:none !important;\n}\n\n.logo-v14-trigger{\n  position:absolute !important;\n  top:-24px !important;\n  right:-2px !important;\n  width:20px !important;\n  height:20px !important;\n  border-radius:50% !important;\n  background:#000 !important;\n  color:#fff !important;\n  display:flex !important;\n  align-items:center !important;\n  justify-content:center !important;\n  cursor:pointer !important;\n  z-index:2147483645 !important;\n  font-size:12px !important;\n  line-height:1 !important;\n  user-select:none !important;\n  box-shadow:0 2px 6px rgba(0,0,0,.25);\n}\n.logo-item,\n#square .brand{ overflow:visible !important; }\n\n#logoMenuV14{\n  position:fixed !important;\n  min-width:118px !important;\n  background:#111 !important;\n  color:#fff !important;\n  border-radius:10px !important;\n  box-shadow:0 8px 24px rgba(0,0,0,.28) !important;\n  padding:6px 0 !important;\n  display:none !important;\n  z-index:2147483647 !important;\n}\n#logoMenuV14.show{ display:block !important; }\n#logoMenuV14 button{\n  width:100% !important;\n  border:0 !important;\n  background:transparent !important;\n  color:#fff !important;\n  text-align:left !important;\n  padding:7px 12px !important;\n  font-size:12px !important;\n  line-height:1.35 !important;\n  cursor:pointer !important;\n}\n#logoMenuV14 button:hover{ background:#2b2b2b !important; }\n#logoMenuV14 button[hidden]{ display:none !important; }\n\n.is-exporting .logo-v14-trigger,\n.is-exporting #logoMenuV14{ display:none !important; }\n\n#logoCropModal{ z-index:2147483646 !important; }\n</style>\n\n\n<style id=\"logo-cropper-modal-style\">\n  .cropper-modal-wrap{\n    position:fixed; inset:0; background:rgba(0,0,0,.5);\n    display:none; align-items:center; justify-content:center; z-index:10020;\n  }\n  .cropper-modal-wrap.open{ display:flex; }\n  .cropper-panel{\n    width:min(90vw, 900px); background:#fff; border-radius:12px; overflow:hidden;\n    display:flex; flex-direction:column;\n  }\n  .cropper-panel header{\n    display:flex; align-items:center; justify-content:space-between;\n    padding:10px 14px; margin:0;\n  }\n  .cropper-panel .body{ padding:10px; }\n  .cropper-panel .actions{ display:flex; gap:8px; padding:10px; justify-content:flex-end; }\n  .cropper-panel img{ max-width:100%; max-height:65vh; display:block; margin:0 auto; }\n";
    document.head.appendChild(s);
  }

  /* ── 注入 Modal HTML ── */
  function injectHTML(){
    if(document.getElementById('logoCropModal')) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = "<div id=\"logoCropModal\" class=\"cropper-modal-wrap\">\n  <div class=\"cropper-panel\">\n    <header>\n      <strong>Logo \u88c1\u5207</strong>\n      <button id=\"logoCropClose\" class=\"btn secondary\" type=\"button\">\u95dc\u9589</button>\n    </header>\n    <div class=\"body\"><img id=\"logoCropImg\" alt=\"Logo \u88c1\u5207\" /></div>\n    <div class=\"actions\">\n<div style=\"font-size:12px;color:#888;padding:0 12px 10px;\">\u540c\u7b49\u6bd4\u88c1\u5207\uff1a\u6309\u4f4fshift\u9375\u518d\u7528\u6ed1\u9f20\u62c9\u6846\u7dda</div>\n      <button id=\"logoCropApply\" class=\"btn\" type=\"button\">\u5957\u7528</button>\n    </div>\n  </div>\n</div>\n\n";
    while(tmp.firstChild) document.body.appendChild(tmp.firstChild);
  }

  /* ── 核心邏輯（從 hbn.html 抽取，移除 hbn 專屬 DOM 依賴） ── */

  var ctx = null;
  var activeCropper = null;
  var activeTarget = null;
  var _cropDone = null;

  function q(sel, root){ return (root||document).querySelector(sel); }

  function closeMenu(){
    var menu = document.getElementById('logoMenuV14');
    if(menu) menu.classList.remove('show');
  }

  function ensureMenu(){
    var menu = document.getElementById('logoMenuV14');
    if(menu) return menu;
    menu = document.createElement('div');
    menu.id = 'logoMenuV14';
    menu.innerHTML =
      '<button type="button" data-action="edit">編輯</button>' +
      '<button type="button" data-action="swap">往右移</button>' +
      '<button type="button" data-action="delete">刪除</button>' +
      '<button type="button" data-action="round">加圓角</button>';
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', function(e){ e.stopPropagation(); }, true);
    menu.addEventListener('click', function(e){
      var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      e.preventDefault(); e.stopPropagation();
      runAction(btn.dataset.action);
      closeMenu();
    }, true);
    return menu;
  }

  function updateMenu(){
    var menu = ensureMenu();
    var swapBtn = menu.querySelector('[data-action="swap"]');
    if(swapBtn) swapBtn.hidden = !(ctx && ctx.showSwap);
    var roundBtn = menu.querySelector('[data-action="round"]');
    if(roundBtn){
      roundBtn.textContent = (ctx && ctx.img && ctx.img.dataset.bnLogoRound === '1') ? '取消圓角' : '加圓角';
    }
  }

  function openMenu(wrap, img, trigger, opts){
    ctx = { wrap:wrap, img:img, opts:opts||{}, showSwap:!!(opts&&opts.showSwap) };
    var menu = ensureMenu();
    updateMenu();
    var rect = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.round(rect.right - 118)) + 'px';
    menu.style.top  = Math.max(8, Math.round(rect.bottom + 6)) + 'px';
    menu.classList.add('show');
  }

  function runAction(action){
    if(!ctx || !ctx.img) return;
    var img = ctx.img, opts = ctx.opts||{};
    if(action === 'edit'){
      /* 開啟 CropperJS 裁切，完成後回呼 opts.onEdit */
      openCropEditor(img.src, function(newSrc){
        if(!newSrc) return;
        img.src = newSrc;
        if(typeof opts.onEdit === 'function') opts.onEdit(img, newSrc);
      });
    } else if(action === 'swap'){
      if(typeof opts.onSwap === 'function') opts.onSwap(img);
    } else if(action === 'delete'){
      if(typeof opts.onDelete === 'function') opts.onDelete(img);
    } else if(action === 'round'){
      var isRound = ctx.img.dataset.bnLogoRound === '1';
      ctx.img.dataset.bnLogoRound = isRound ? '' : '1';
      ctx.img.style.borderRadius = isRound ? '' : '50%';
      updateMenu();
      if(typeof opts.onRound === 'function') opts.onRound(img, !isRound);
    }
  }

  /* ── CropperJS 裁切 ── */
  function destroyCropper(){
    try{ activeCropper && activeCropper.destroy(); }catch(_){}
    activeCropper = null;
  }

  function openCropEditor(src, onDone){
    injectCSS();
    injectHTML();
    _cropDone = onDone || null;
    loadCropper(function(){
      var modal   = document.getElementById('logoCropModal');
      var cropImg = document.getElementById('logoCropImg');
      var apply   = document.getElementById('logoCropApply');
      var close   = document.getElementById('logoCropClose');
      if(!modal || !cropImg) return;

      activeTarget = null;
      destroyCropper();
      /* 重設 img 讓瀏覽器重新 load */
      cropImg.removeAttribute('src');
      modal.classList.add('open');

      cropImg.onload = function(){
        cropImg.onload = null;
        destroyCropper();
        activeCropper = new Cropper(cropImg, {
          viewMode: 1,
          autoCropArea: 1,
          movable: true,
          zoomable: true,
          scalable: true,
          background: false
        });
      };
      cropImg.src = src;

      /* 「套用」按鈕 */
      if(apply && apply.dataset.bnBound !== '1'){
        apply.dataset.bnBound = '1';
        apply.addEventListener('click', function(){
          if(!activeCropper) return;
          var out = activeCropper.getCroppedCanvas();
          if(!out) return;
          var url = out.toDataURL('image/png');
          destroyCropper();
          modal.classList.remove('open');
          if(typeof _cropDone === 'function'){ _cropDone(url); _cropDone = null; }
        });
      }
      /* 「關閉」按鈕 */
      if(close && close.dataset.bnBound !== '1'){
        close.dataset.bnBound = '1';
        close.addEventListener('click', function(){
          destroyCropper();
          modal.classList.remove('open');
          _cropDone = null;
        });
      }
    });
  }

  /* ── 附加觸發器到 logo 縮圖 ── */
  function attach(imgEl, opts){
    injectCSS();
    var wrap = imgEl.parentElement;
    if(!wrap) return;
    wrap.style.overflow = 'visible';
    wrap.style.position = 'relative';

    /* 移除舊觸發器 */
    var old = wrap.querySelector('.logo-v14-trigger');
    if(old) old.remove();

    var trigger = document.createElement('div');
    trigger.className = 'logo-v14-trigger';
    trigger.textContent = '✎';
    trigger.title = 'Logo 功能';
    wrap.appendChild(trigger);

    trigger.style.display = imgEl.getAttribute('src') ? 'flex' : 'none';

    trigger.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      document.addEventListener('click', closeMenu, { once:true });
      openMenu(wrap, imgEl, trigger, opts||{});
    }, true);

    /* src 變化時更新顯示 */
    var obs = new MutationObserver(function(){
      trigger.style.display = imgEl.getAttribute('src') ? 'flex' : 'none';
    });
    obs.observe(imgEl, { attributes:true, attributeFilter:['src'] });
  }

  /* ── 關閉 menu 點外部 ── */
  document.addEventListener('click', function(e){
    var menu = document.getElementById('logoMenuV14');
    if(menu && !menu.contains(e.target)) closeMenu();
  });

  /* ── 公開 API ── */
  global.BNLogoMenu = {
    attach: attach,
    openCropEditor: openCropEditor
  };

}(window));
