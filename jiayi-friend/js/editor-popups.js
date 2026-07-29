'use strict';

/* ── Popup ── */
var BG_OPTIONS = [
  { key:'A', label:'款式 A（黃色）', color:'#F5C842', url:'backgrounds/02_lpbn.jpg' },
  { key:'B', label:'款式 B（粉色）', color:'#F5A0C5', url:'backgrounds/02_lpbn.jpg' },
  { key:'C', label:'款式 C（藍色）', color:'#bee1f2', url:'backgrounds/02_lpbn.jpg' },
];

function openPopup(type){
  if(type==='bg'){
    buildBgPopup();
    document.getElementById('popup-bg').classList.add('open');
  } else if(type==='host'){
    buildHostPopup();
    document.getElementById('popup-host').classList.add('open');
  }
}

function closePopup(type){
  document.getElementById('popup-'+type).classList.remove('open');
}

// 點 overlay 關閉
['bg','host','shadow'].forEach(function(type){
  document.getElementById('popup-'+type).addEventListener('click', function(e){
    if(e.target === this) closePopup(type);
  });
});

function buildBgPopup(){
  var body = document.getElementById('popup-bg-body');
  body.innerHTML = '';
  BG_OPTIONS.forEach(function(opt){
    var card = document.createElement('div');
    card.className = 'popup-card' + (S.theme===opt.key ? ' selected' : '');
    card.innerHTML =
      '<div style="height:60px;background:'+opt.color+';border-radius:4px 4px 0 0;overflow:hidden;">'
      +(opt.url ? '<img src="'+opt.url+'" style="width:100%;height:100%;object-fit:cover;">' : '')
      +'</div>'
      +'<div class="popup-card-label">'+opt.label+'</div>';
    card.onclick = function(){
      setTheme(opt.key);
      closePopup('bg');
    };
    body.appendChild(card);
  });
}

function buildHostPopup(){
  var body = document.getElementById('popup-host-body');
  body.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px;text-align:center;">掃描圖庫中...</div>';
  body.style.display = 'block';

  /* 先取得 brandName */
  var brandName = '';
  var activeTab = TABS[ACTIVE_TAB];
  if(activeTab && activeTab.data && activeTab.data.brand){
    brandName = activeTab.data.brand.trim();
  }
  if(!brandName || brandName === 'XXX'){
    brandName = ((document.getElementById('txt-brand')||{}).value || '').trim();
  }
  if(brandName === 'XXX') brandName = '';

  function renderHosts(hosts){
    /* 合併 localStorage 的圖（如有）*/
    var libStored = [];
    try{ libStored = JSON.parse(localStorage.getItem('bn_hosts_star_studio_v1')||'[]'); }catch(e){}
    var allHosts = hosts.slice();
    libStored.forEach(function(h){
      var hname = h.name.replace(/\.[^.]+$/,'');
      /* 有 brandName 時只納入同名的 */
      if(brandName && hname.replace(/[-_]\d+$/,'') !== brandName) return;
      var exists = allHosts.find(function(fh){ return fh.name === hname; });
      if(!exists) allHosts.push({ name: hname, src: h.src });
    });

    body.innerHTML = '';
    if(!allHosts.length){
      body.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px;text-align:center;">找不到「'+brandName+'」的圖片<br><small>請確認 hosts/'+brandName+'/ 資料夾已放入去背圖</small></div>';
      return;
    }
    body.style.display = 'grid';
    allHosts.forEach(function(host){
      var card = document.createElement('div');
      card.className = 'popup-card';
      card.innerHTML =
        '<img src="'+host.src+'" style="height:100px;object-fit:cover;">'
        +'<div class="popup-card-label">'+host.name+'</div>';
      card.onclick = function(){
        var hsrc = host.src;
        var hname = host.name;
        closePopup('host');
        loadSrcAsBase64(hsrc, function(b64){
          if(b64){ applyHost(b64, hname); }
          else { toast('圖片載入失敗','err'); }
        });
      };
      body.appendChild(card);
    });
  }

  if(brandName){
    /* 直接掃該主持人的資料夾 */
    scanHostByName(brandName, function(found){
      if(found.length){
        renderHosts(found);
      } else {
        /* 資料夾找不到：fallback 掃全部 */
        scanHostLibrary(function(all){ renderHosts(all); });
      }
    });
  } else {
    /* 沒有主持人名稱：掃全部 */
    scanHostLibrary(function(all){ renderHosts(all); });
  }
}

function applyHost(src, name){
  S.imgs.host = src;
  var imgEl = document.getElementById('host-img');
  if(imgEl){ imgEl.src=src; imgEl.dataset.baseSrc=src; }
  var item = document.getElementById('host-item');
  if(item) item.style.display='block';
  /* 更新 sidebar 顯示 */
  var thumb = document.getElementById('host-preview-thumb');
  var label = document.getElementById('host-preview-label');
  if(thumb) thumb.innerHTML = '<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  if(label){ label.textContent = name; label.style.color = 'var(--success)'; }
  broadcastFull();
}

/* ── Theme ── */

function handleUpload(e,key){
  var file=e.target.files[0]; if(!file) return;
  applyImageFile(file,key);
  e.target.value='';
}

/* 共用：把一個 File 讀成 dataURL 套進 host/logo1/logo2，不管來源是手動選檔還是資料夾批次比對 */
function applyImageFile(file,key,cb){
  var reader=new FileReader();
  reader.onload=function(ev){
    var src=ev.target.result;
    S.imgs[key]=src;
    var imgEl=document.getElementById(key+'-img');
    if(imgEl){ imgEl.src=src; imgEl.dataset.baseSrc=src; }
    var item=document.getElementById(key+'-item');
    if(item) item.style.display='block';
    var labels={host:'主持人已載入',logo1:'蝦皮直播 Logo 已載入',logo2:'明星直播間 Logo 已載入'};
    markUpload(key,labels[key]);
    broadcastFull(); // 上傳時才傳圖片
    if(cb) cb();
  };
  reader.readAsDataURL(file);
}

function markUpload(key,label){
  var row=document.getElementById(key+'-row'); if(!row) return;
  row.classList.add('done');
  var lbl=row.querySelector('.upload-label'); if(lbl) lbl.textContent=label;
}

/* openEditor 已移至畫布內懸浮 bar 處理 */

/* ── Helpers ── */

