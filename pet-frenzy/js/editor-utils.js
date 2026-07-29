'use strict';

/* ── 活動名稱：顯示在左上角、也用在下載檔名裡 ── */
var ACTIVITY_NAME = '毛孩衝蝦米';

/* 日期格式化：抓 M/D，兩邊補0成4碼 MMDD（檔名用，補0後長度固定、好排序） */
function formatDateMMDD(raw){
  if(!raw) return '';
  var m = String(raw).match(/(\d{1,2})\/(\d{1,2})/);
  if(!m) return String(raw).replace(/\//g,'');
  function pad(n){ return n.length<2 ? '0'+n : n; }
  return pad(m[1])+pad(m[2]);
}
/* 分頁日期：優先讀「日期」欄位；新版工單常把日期併在「時間」欄位裡（例如「6/15 19:00」），
   沒有獨立日期欄位時改抓時間字串開頭的日期部分 */
function getTabDateRaw(tabData){
  var d = tabData || {};
  if(d.date) return d.date;
  if(d.time){
    var m = String(d.time).match(/^\s*(\d{1,2}\/\d{1,2})/);
    if(m) return m[1];
  }
  return '';
}

function toast(msg,type,duration){
  var el=document.getElementById('toast-el');
  el.textContent=msg; el.className='toast '+(type||'')+' show';
  clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove('show');},duration||2500);
}
window.showToast=toast;

/* ── State ── */

function v(id){ return (document.getElementById(id)||{}).value||''; }

function cc(inputId,countId,max){
  var val = v(inputId);
  var len = 0;
  for(var i=0; i<val.length; i++){
    var code = val.codePointAt(i);
    /* 中文、全形、CJK：算 1 */
    if(
      (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK 統一漢字
      (code >= 0x3400 && code <= 0x4DBF) ||  // CJK 擴展A
      (code >= 0xF900 && code <= 0xFAFF) ||  // CJK 相容
      (code >= 0x3000 && code <= 0x303F) ||  // CJK 符號
      (code >= 0xFF00 && code <= 0xFF60) ||  // 全形英數
      (code >= 0xAC00 && code <= 0xD7AF)     // 韓文
    ){
      len += 1;
    } else if(code > 0xFFFF){
      len += 1; i++; // surrogate pair
    } else {
      len += 0.5; // 英數、半形符號
    }
  }
  len = Math.ceil(len * 2) / 2;
  var el=document.getElementById(countId); if(!el) return;
  el.textContent=len+' / '+max;
  el.classList.toggle('over', len > max);
}
/* ── 字數超限檢查 ── */
var _overlimitContinue = null;
var OVER_LIMIT_FIELDS = [
  { ccId:'cc-sub',  label:'主標（小字）' },
  { ccId:'cc-main', label:'副標（大字）' }
];

function checkOverLimit(proceedFn){
  var overs = OVER_LIMIT_FIELDS.filter(function(f){
    var el = document.getElementById(f.ccId);
    return el && el.classList.contains('over');
  });
  if(overs.length === 0){ proceedFn(); return; }
  var msg = '以下欄位的文案超過字數限制：<br><br>';
  overs.forEach(function(f){
    var el = document.getElementById(f.ccId);
    msg += '・<b>'+f.label+'</b>　'+el.textContent+'<br>';
  });
  msg += '<br>建議返回調整，避免畫面文字被截斷。';
  document.getElementById('overlimit-msg').innerHTML = msg;
  _overlimitContinue = function(){
    document.getElementById('popup-overlimit').classList.remove('open');
    proceedFn();
  };
  document.getElementById('popup-overlimit').classList.add('open');
}


function setPill(rowId,el){
  document.querySelectorAll('#'+rowId+' .pill').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
}

/* ── 直播間FL ICON：純文案／商品1-3／LOGO／不製作 ── */

/* 記住上一次「FL文案是不是LOGO」的狀態，只在「剛變成LOGO」那一刻自動彈出
   Logo2編輯popup，避免每次打字都彈出來、或使用者手動關掉後又被強制重新打開。 */
var _flWasLogo = false;

/* 下拉選單「直播間FL ICON」切換時呼叫。選單值本身就能代表LOGO模式，
   但也同步寫回 txt-fl 欄位（跟工單匯入、07_fl.html 判斷版型L的方式保持一致）：
     切到LOGO → 自動把 txt-fl 填成「logo」
     從LOGO切開 → 如果 txt-fl 裡還殘留「logo」字樣（使用者沒手動改過），自動清空 */
function handleFlSlotChange(value){
  window._flProductSlotValue = value || null;
  var flEl = document.getElementById('txt-fl');
  if(flEl){
    if(value === 'logo'){
      flEl.value = 'logo';
    } else if(flEl.value.trim().toLowerCase() === 'logo'){
      flEl.value = '';
    }
  }
  ccFlUserTriggered();
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  if(typeof broadcast === 'function') broadcast();
}

function ccFl(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  var raw  = (document.getElementById('txt-fl') || {}).value || '';
  /* LOGO判斷雙重保險：下拉選單選「LOGO」，或 txt-fl 文字直接打「logo」，兩種都算 */
  var isLogo = slot === 'logo' || raw.trim().toLowerCase() === 'logo';
  var max  = (slot && !isLogo) ? 5 : 6;
  cc('txt-fl', 'cc-fl', max);
  var el = document.getElementById('cc-fl');
  if(el){
    var parts = el.textContent.split('/');
    el.textContent = (parts[0] || '0') + '/ ' + max;
  }
  _flWasLogo = isLogo;
}

/* 使用者真的手動操作（切下拉選單／打字）才呼叫這支，判斷「剛從非LOGO變成LOGO」
   的那一刻才自動跳出 Logo2 編輯 popup。 */
function ccFlUserTriggered(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  var raw  = (document.getElementById('txt-fl') || {}).value || '';
  var isLogo = slot === 'logo' || raw.trim().toLowerCase() === 'logo';
  var wasLogo = _flWasLogo;
  ccFl();
  if(isLogo && !wasLogo && typeof openLogo2Popup === 'function'){
    openLogo2Popup(false);
  }
}

/* ── Save / Load ── */

