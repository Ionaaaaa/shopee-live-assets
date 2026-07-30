'use strict';

/* ── 活動名稱：顯示在左上角、也用在下載檔名裡 ── */
var ACTIVITY_NAME = 'MCN代播';

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

/* ── Save / Load ── */

