/*
  shadow-editor-plugin.js
  掛載方式：在 editor.html 的 </body> 前加一行
    <script src="js/shadow-editor-plugin.js"></script>
  （要放在 editor.html 自己內建那些 <script> 之後，這樣才抓得到 window.iframes）

  這支 plugin 會：
  1. 掛載到 #shadow-editor-mount（通常放在「商品／主持人 陰影」確認 popup 裡）；
     找不到的話退回掛在 #sidebar-scroll，維持舊行為
  2. 使用者操作時，透過 postMessage 廣播給「所有目前已建立的 iframe」（window.iframes）
     -- 沒有安裝對應接收腳本的版位會自動忽略這些訊息，不會互相干擾
  3. 素材命名為 host1 / host2 / product1 / product2 / product3
     （host1＝主持人，host2＝來賓），對應公版工單 M20:M24，方便之後 Excel／資料夾自動化直接寫入
  4. 某個 layout iframe 送出 LC_READY 時，會把目前完整狀態（背景、角度、
     已啟用欄位、每個已上傳的素材）重新推送給那個 iframe，
     所以新開的分頁 / 重新整理過的 iframe 都能正確同步
  5. 支援「暫存模式」：進入暫存模式後，combo/角度/素材的變更只更新本地畫面，
     不會馬上廣播給畫布；呼叫 commit() 才會把目前狀態一次送出去。
     這是為了配合「匯入工單 → 先在 popup 裡確認 → 按確認才套用到畫布」的流程。
*/
(function () {
  'use strict';
  console.log('%c[shadow-editor-plugin.js] 版本確認：2026-07-06-v2（含combo廣播＋商品比例功能）', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

  // 對應公版工單 M20:M24
  var SLOT_DEFS = [
    { id: 'host1', label: '主持人', type: 'person' },
    { id: 'host2', label: '來賓', type: 'person' },
    { id: 'product1', label: '商品1', type: 'product' },
    { id: 'product2', label: '商品2', type: 'product' },
    { id: 'product3', label: '商品3', type: 'product' }
  ];
  // 對應公版工單 M28:R32
  var COMBOS = { // enabled 陣列順序＝預設疊放順序：陣列前面＝後方，後面＝前方
    A: { label: 'A組合（2人）', enabled: ['host2', 'host1'] },                    // 主持人最前面
    B: { label: 'B組合（2人+1品）', enabled: ['product1', 'host2', 'host1'] },    // 主持人最前，來賓其次，商品在最後方
    C: { label: 'C組合（1人+2品）', enabled: ['product1', 'product2', 'host1'] }, // 主持人最前，商品2在商品1前面
    D: { label: 'D組合（3品）', enabled: ['product1', 'product2', 'product3'] }   // 商品3（取代主持人位置）最前面，跟C組合主持人最前面的邏輯一致
  };

  var state = {
    combo: 'D',
    angle: 'top',
    bgDataUrl: null,
    slots: {}, // slotId -> dataUrl
    slotRatios: {}, // slotId -> 0~1 的比例（Excel「(商品)比例」欄位，第一次貼合大小要再乘上這個倍率；100%/沒填就是 1）
    order: []  // 手動疊放順序：陣列前面＝後方，後面＝前方；也是左側清單的顯示順序來源（清單上面＝最前面，所以顯示時要反過來）
  };
  var activeSlotId = null;
  var selectedIds = []; // 多選用；只選一個時 activeSlotId 會同步等於 selectedIds[0]（向下相容）
  var readyFrames = {}; // iframeId -> true
  var pendingMode = false; // true 時：狀態變更不廣播，等 commit() 才一次送出
  var changeListeners = []; // 給外部（例如 1200x1200 大畫布）訂閱狀態變更用，跟 pendingMode 無關，一律即時通知

  function setSelection(ids){
    selectedIds = (ids || []).filter(function(id){ return state.slots[id]; });
    activeSlotId = selectedIds.length === 1 ? selectedIds[0] : null;
  }

  function currentCombo(){ return COMBOS[state.combo]; }

  // 讓 state.order 跟目前版型的 enabled 清單保持一致：
  // 移除不再屬於這個版型的 id、把新出現但還沒排過序的 id 補到最上層（最前面）
  function syncOrder(){
    var enabled = currentCombo().enabled;
    state.order = state.order.filter(function(id){ return enabled.indexOf(id) !== -1; });
    enabled.forEach(function(id){ if (state.order.indexOf(id) === -1) state.order.push(id); });
  }

  function getFullStateSnapshot(){
    return {
      combo: state.combo,
      angle: state.angle,
      bgDataUrl: state.bgDataUrl,
      slots: Object.assign({}, state.slots),
      slotRatios: Object.assign({}, state.slotRatios),
      enabled: currentCombo().enabled.slice(),
      order: state.order.slice(),
      activeSlotId: activeSlotId,
      selectedIds: selectedIds.slice()
    };
  }
  function notifyChange(){
    var snap = getFullStateSnapshot();
    changeListeners.forEach(function(cb){ try{ cb(snap); }catch(e){ console.warn('shadow-editor-plugin onStateChange callback error:', e); } });
  }

  function injectStyle(){
    if (document.getElementById('shadow-editor-plugin-style')) return;
    var style = document.createElement('style');
    style.id = 'shadow-editor-plugin-style';
    style.textContent =
      '.lc-ang-group{display:flex;gap:6px;margin-bottom:12px;}' +
      '.lc-ang{flex:1;background:var(--surface);color:var(--text-muted);border:1px solid var(--border2);border-radius:var(--radius);padding:6px 0;font-size:12px;cursor:pointer;}' +
      '.lc-ang.active{background:var(--accent);color:#fff;border-color:var(--accent);}' +
      '.lc-field{margin-bottom:12px;}' +
      '.lc-field label{display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;}' +
      '.lc-field select,.lc-field input[type=file]{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border2);border-radius:var(--radius);padding:6px 8px;font-size:12px;}' +
      '.lc-slotbar{display:flex;flex-direction:column;gap:8px;}' +
      '.lc-slot{position:relative;display:flex;align-items:center;gap:8px;padding:8px 24px 8px 8px;border:2px dashed var(--border2);border-radius:var(--radius);cursor:grab;background:var(--surface);}' +
      '.lc-slot.filled{border-style:solid;}' +
      '.lc-slot.active{border-color:var(--accent);}' +
      '.lc-slot.multi{border-color:#ff9800;}' +
      '.lc-slot.person{border-color:#e2904a;}' +
      '.lc-slot.person.active{border-color:var(--accent);}' +
      '.lc-drag{opacity:.5;font-size:13px;flex-shrink:0;}' +
      '.lc-thumb{width:44px;height:44px;border-radius:6px;overflow:hidden;background:#222;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.lc-thumb img{width:100%;height:100%;object-fit:contain;}' +
      '.lc-thumb .lc-plus{font-size:18px;color:var(--text-dim);}' +
      '.lc-meta{font-size:12px;color:var(--text);}' +
      '.lc-meta .lc-tag{font-size:10px;color:var(--text-dim);display:block;margin-top:2px;}' +
      '.lc-del{position:absolute;top:4px;right:4px;background:#a33;color:#fff;font-size:10px;width:16px;height:16px;line-height:16px;text-align:center;border-radius:4px;cursor:pointer;}';
    document.head.appendChild(style);
  }

  function buildSectionHTML(){
    var comboOptions = Object.keys(COMBOS).map(function(k){
      return '<option value="' + k + '"' + (k===state.combo?' selected':'') + '>' + COMBOS[k].label + '</option>';
    }).join('');
    return '' +
      '<div class="sg" id="lc-sg">' +
        '<div class="sg-body">' +
          '<div class="lc-field">' +
            '<label>版型組合</label>' +
            '<select id="lc-combo-sel">' + comboOptions + '</select>' +
          '</div>' +
          '<div class="lc-field">' +
            '<label>光源角度</label>' +
            '<div class="lc-ang-group">' +
              '<button class="lc-ang" data-ang="left">左上</button>' +
              '<button class="lc-ang active" data-ang="top">正上</button>' +
              '<button class="lc-ang" data-ang="right">右上</button>' +
            '</div>' +
          '</div>' +
          '<div class="lc-field">' +
            '<label>背景圖（選填）</label>' +
            '<input type="file" id="lc-bg-file" accept="image/*">' +
          '</div>' +
          '<div class="lc-field">' +
            '<label>素材（拖曳可移動，右上角 × 可刪除）</label>' +
            '<div class="lc-slotbar" id="lc-slotbar"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function mount(){
    // 優先掛到「商品／主持人 陰影」確認 popup 裡；找不到才退回舊的 #sidebar-scroll
    var host = document.getElementById('shadow-editor-mount') || document.getElementById('sidebar-scroll');
    if (!host){ console.warn('shadow-editor-plugin: 找不到掛載點，無法掛載'); return; }
    injectStyle();
    var wrap = document.createElement('div');
    wrap.innerHTML = buildSectionHTML();
    host.appendChild(wrap.firstElementChild);
    bindEvents();
    renderSlotBar();
  }

  function broadcastToAllFrames(msg){
    if (pendingMode) return; // 暫存模式：先不送，等 commit()
    var frames = window.iframes || {};
    Object.keys(frames).forEach(function(id){
      var ifr = frames[id];
      if (ifr && ifr.contentWindow){
        try { ifr.contentWindow.postMessage(msg, '*'); } catch(e){}
      }
    });
  }
  function sendFullStateTo(ifr){
    if (!ifr || !ifr.contentWindow) return;
    var w = ifr.contentWindow;
    if (state.bgDataUrl) w.postMessage({ type:'LC_SET_BG', dataUrl: state.bgDataUrl }, '*');
    w.postMessage({ type:'LC_SET_ANGLE', preset: state.angle }, '*');
    /* 版型／疊放順序要先送，upsertSlot 判斷「這個版型該用哪組預設位置」才會抓到正確的版型，
       不然素材先送到，接收端還不知道目前是哪個版型，byCombo 覆蓋就會判斷錯 */
    w.postMessage({ type:'LC_SET_ENABLED', ids: state.order, combo: state.combo }, '*');
    SLOT_DEFS.forEach(function(def){
      if (state.slots[def.id]){
        w.postMessage({ type:'LC_UPSERT_SLOT', slotId: def.id, slotType: def.type, dataUrl: state.slots[def.id], ratio: state.slotRatios[def.id] }, '*');
      }
    });
  }

  function broadcastEnabled(){
    broadcastToAllFrames({ type:'LC_SET_ENABLED', ids: state.order, combo: state.combo });
  }

  var hiddenInputs = {};
  function ensureHiddenInput(slotId){
    if (hiddenInputs[slotId]) return hiddenInputs[slotId];
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.addEventListener('change', function(e){
      var file = e.target.files[0];
      if (file) loadSlotFile(slotId, file);
      inp.value = '';
    });
    document.body.appendChild(inp);
    hiddenInputs[slotId] = inp;
    return inp;
  }

  // 共用：把已經拿到的 dataURL 套進某個 slot（不管來源是檔案上傳、URL 抓圖、或外部 API 呼叫）
  // ratio：0~1 的比例（來自 Excel「(商品)比例」欄位），只在這個 slot 第一次被加入時生效；
  //        不是每次呼叫都要帶，沒有就維持原本行為（100%，不縮小）
  function applySlotDataUrl(slotId, dataUrl, ratio){
    var def = SLOT_DEFS.filter(function(d){ return d.id===slotId; })[0];
    if (!def) return;
    state.slots[slotId] = dataUrl;
    if (typeof ratio === 'number') state.slotRatios[slotId] = ratio;
    broadcastToAllFrames({ type:'LC_UPSERT_SLOT', slotId: slotId, slotType: def.type, dataUrl: dataUrl, ratio: ratio });
    setSelection([slotId]);
    renderSlotBar();
    notifyChange();
  }

  function loadSlotFile(slotId, file, ratio){
    var reader = new FileReader();
    reader.onload = function(ev){ applySlotDataUrl(slotId, ev.target.result, ratio); };
    reader.readAsDataURL(file);
  }

  // 依 URL／路徑載入（給「依檔名找資料夾」用）：轉成 dataURL 後跟上傳檔案走同一條路
  function loadSlotFromUrl(slotId, url, cb){
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function(){
      try{
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        var dataUrl = c.toDataURL('image/png');
        applySlotDataUrl(slotId, dataUrl);
        if (cb) cb(true);
      } catch(e){
        // CORS 等問題：退回直接用路徑（本機同源資料夾通常不會遇到）
        applySlotDataUrl(slotId, url);
        if (cb) cb(true);
      }
    };
    img.onerror = function(){ if (cb) cb(false); };
    img.src = url;
  }

  function removeSlot(slotId){
    delete state.slots[slotId];
    broadcastToAllFrames({ type:'LC_REMOVE_SLOT', slotId: slotId });
    setSelection(selectedIds.filter(function(id){ return id !== slotId; }));
    renderSlotBar();
    notifyChange();
  }

  // A/B/C 三個組合都至少包含一位主持人，遮罩（補主持人身體過短貼不到底部）
  // 在這三組合下預設打開；D 是純商品組合沒有主持人，維持原本預設關閉，不自動開，
  // 也不會因為切到 D 就強制把使用者已經打開的遮罩關掉
  function maybeAutoEnableMaskForCombo(letter){
    if (letter !== 'A' && letter !== 'B' && letter !== 'C') return;
    if (typeof S === 'undefined' || S.maskOn) return;
    var cb = document.getElementById('mask-toggle-input');
    if (cb) cb.checked = true;
    if (typeof onMaskToggleChange === 'function') onMaskToggleChange(true);
  }

  function setCombo(letter){
    if (!COMBOS[letter]) return false;
    state.combo = letter;
    var sel = document.getElementById('lc-combo-sel');
    if (sel) sel.value = letter;
    setSelection(selectedIds.filter(function(id){ return currentCombo().enabled.indexOf(id) !== -1; }));
    /* 切換版型時直接重設成這個版型的預設疊放順序，不要沿用舊版型可能留下的順序──
       每個版型的疊放順序應該互相獨立，不然像「測過 D 組合後切回 C」這種情況，
       商品1/商品2的前後順序會被 D 組合留下的順序卡住，跟 C 組合原本設定的順序不一樣 */
    state.order = currentCombo().enabled.slice();
    renderSlotBar();
    broadcastEnabled();
    maybeAutoEnableMaskForCombo(letter);
    notifyChange();
    return true;
  }

  function renderSlotBar(){
    var bar = document.getElementById('lc-slotbar');
    if (!bar) return;
    syncOrder(); // 保險：確保 order 一定跟目前版型的 enabled 清單同步
    bar.innerHTML = '';
    // 清單顯示：上面＝最前面，所以要把 state.order（陣列後面＝前面）反過來顯示
    var displayOrder = state.order.slice().reverse();

    displayOrder.forEach(function(slotId, displayIdx){
      var def = SLOT_DEFS.filter(function(d){ return d.id===slotId; })[0];
      if (!def) return;
      var box = document.createElement('div');
      box.className = 'lc-slot' + (def.type==='person' ? ' person' : '') + (state.slots[def.id] ? ' filled' : '') + (activeSlotId===def.id ? ' active' : '') + (selectedIds.indexOf(def.id)!==-1 && selectedIds.length>1 ? ' multi' : '');
      box.draggable = true;
      box.dataset.displayIdx = displayIdx;

      var drag = document.createElement('div');
      drag.className = 'lc-drag';
      drag.textContent = '⠿';
      box.appendChild(drag);

      var thumb = document.createElement('div');
      thumb.className = 'lc-thumb';
      if (state.slots[def.id]){
        var img = document.createElement('img');
        img.src = state.slots[def.id];
        thumb.appendChild(img);
        var del = document.createElement('div');
        del.className = 'lc-del';
        del.textContent = '×';
        del.title = '刪除此素材';
        del.addEventListener('click', function(e){ e.stopPropagation(); removeSlot(def.id); });
        box.appendChild(del);
      } else {
        var plus = document.createElement('div');
        plus.className = 'lc-plus';
        plus.textContent = '＋';
        thumb.appendChild(plus);
      }
      box.appendChild(thumb);

      var meta = document.createElement('div');
      meta.className = 'lc-meta';
      meta.innerHTML = def.label + '<span class="lc-tag">' + (def.type==='person' ? '主持人・光暈陰影' : '商品・貼地陰影') + '</span>';
      box.appendChild(meta);

      box.addEventListener('click', function(e){
        if (state.slots[def.id]){
          if (e.ctrlKey || e.metaKey || e.shiftKey){
            // 多選：已選取就移除，沒選取就加入
            var idx = selectedIds.indexOf(def.id);
            var next = selectedIds.slice();
            if (idx === -1) next.push(def.id); else next.splice(idx, 1);
            setSelection(next);
          } else {
            setSelection([def.id]);
          }
          renderSlotBar();
          notifyChange(); // 讓外部（1200x1200 大畫布）同步選取狀態，不用在畫布上一直點被擋住的東西
        } else {
          ensureHiddenInput(def.id).click();
        }
      });

      // 拖曳調整前後順序（跟刪除做在同一個清單裡，不用切去別的地方）
      box.addEventListener('dragstart', function(e){
        _dragFromDisplayIdx = displayIdx;
        e.dataTransfer.effectAllowed = 'move';
        box.style.opacity = '0.4';
      });
      box.addEventListener('dragend', function(){ box.style.opacity = '1'; });
      box.addEventListener('dragover', function(e){ e.preventDefault(); });
      box.addEventListener('drop', function(e){
        e.preventDefault();
        var toIdx = displayIdx;
        if (_dragFromDisplayIdx === null || _dragFromDisplayIdx === toIdx) return;
        var moved = displayOrder.splice(_dragFromDisplayIdx, 1)[0];
        displayOrder.splice(toIdx, 0, moved);
        // displayOrder 是「上＝前景」，換回 state.order（陣列後面＝前景）要再反轉一次
        state.order = displayOrder.slice().reverse();
        _dragFromDisplayIdx = null;
        broadcastEnabled();
        renderSlotBar();
        notifyChange();
      });

      bar.appendChild(box);
    });
  }
  var _dragFromDisplayIdx = null; // 拖曳中：清單顯示順序（上=前景）的索引

  function bindEvents(){
    document.getElementById('lc-combo-sel').addEventListener('change', function(e){
      state.combo = e.target.value;
      setSelection(selectedIds.filter(function(id){ return currentCombo().enabled.indexOf(id) !== -1; }));
      renderSlotBar();
      broadcastEnabled();
      maybeAutoEnableMaskForCombo(state.combo);
      notifyChange();
    });
    document.getElementById('lc-bg-file').addEventListener('change', function(e){
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        state.bgDataUrl = ev.target.result;
        broadcastToAllFrames({ type:'LC_SET_BG', dataUrl: ev.target.result });
        notifyChange();
      };
      reader.readAsDataURL(file);
    });
    document.querySelectorAll('.lc-ang').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.lc-ang').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        state.angle = btn.dataset.ang;
        broadcastToAllFrames({ type:'LC_SET_ANGLE', preset: state.angle });
        notifyChange();
      });
    });
  }

  window.addEventListener('message', function(e){
    var msg = e.data;
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'LC_READY'){
      // 找出是哪個 iframe 送出的，回推完整狀態給它（新載入/重整過的 iframe 都能同步）
      var frames = window.iframes || {};
      Object.keys(frames).forEach(function(id){
        var ifr = frames[id];
        if (ifr && ifr.contentWindow === e.source){
          readyFrames[id] = true;
          sendFullStateTo(ifr);
        }
      });
    } else if (msg.type === 'LC_SELECTION_CHANGED'){
      setSelection(msg.slotIds || []);
      renderSlotBar();
    }
  });

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ── 對外 API：給「匯入工單」popup 或未來的資料夾自動比對邏輯呼叫 ──
  window.ShadowEditor = {
    SLOT_DEFS: SLOT_DEFS,           // [{id,label,type}]，type: 'person' | 'product'
    COMBOS: COMBOS,
    getCombo: function(){ return state.combo; },
    setCombo: setCombo,             // setCombo('A'|'B'|'C'|'D')
    getSlotDataUrl: function(slotId){ return state.slots[slotId] || null; },
    setSlotFromFile: loadSlotFile,       // setSlotFromFile(slotId, fileObj, ratio?) → ratio是0~1的比例，來自Excel「(商品)比例」欄位，選填
    setSlotFromUrl: loadSlotFromUrl,     // setSlotFromUrl(slotId, url, cb) → cb(found:boolean)
    removeSlot: removeSlot,
    refreshUI: renderSlotBar,
    /* 暫存模式：匯入工單時用，先比對／填格子但不廣播，等使用者在 popup 裡按確認才 commit() */
    enterPending: function(){ pendingMode = true; },
    isPending: function(){ return pendingMode; },
    commit: function(){
      pendingMode = false;
      var frames = window.iframes || {};
      Object.keys(frames).forEach(function(id){ sendFullStateTo(frames[id]); });
    },
    /* 給 1200x1200 大畫布訂閱：combo/角度/素材任何變動都會呼叫 cb(snapshot)，跟 pendingMode 無關、永遠即時 */
    getFullState: getFullStateSnapshot,
    onStateChange: function(cb){ if(typeof cb === 'function') changeListeners.push(cb); },
    /* 多選（給大畫布回報選取狀態變化時同步左側清單用） */
    getSelectedIds: function(){ return selectedIds.slice(); },
    setSelectedIds: function(ids){ setSelection(ids); renderSlotBar(); notifyChange(); }
  };
})();
