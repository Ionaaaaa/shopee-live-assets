'use strict';
/*
  build-host-manifest.js
  ------------------------------------------------------------
  掃描 hosts/ 資料夾，把每個子資料夾（=一位主持人）裡實際有哪些圖片檔案
  寫成 hosts/manifest.json，格式：

    {
      "generatedAt": "2026-08-11T12:00:00.000Z",
      "hosts": {
        "艾伶": ["艾伶-1.png", "艾伶-2.png", "艾伶備用.png"],
        "Penny": ["Penny-1.png", "Penny-2.png", "Penny-3.png", "Penny-4.png"]
      }
    }

  為什麼需要這份清單：
  瀏覽器端（editor.html）沒辦法對一個靜態網站的資料夾說「把裡面檔案列給我看」，
  只能用「猜檔名」的方式試（例如猜 姓名-1.png、姓名-2.png...）。這種猜法
  猜不到「艾伶備用.png」這種不含編號的檔名。有了這份清單，瀏覽器只要
  fetch('hosts/manifest.json')，就能直接知道每個主持人資料夾裡實際有哪些檔案，
  不用再用猜的。

  這支程式不會自己執行，是靠 .github/workflows/host-manifest.yml
  在每次 push 到 hosts/ 資料夾時自動跑一次、自動把新的 manifest.json commit
  回去，所以平常只要照舊把圖丟進 hosts/<主持人名稱>/ 資料夾、push 上去即可，
  不需要手動執行這支script（本機想手動測試也可以直接跑 node scripts/build-host-manifest.js）。
*/

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var HOSTS_DIR = path.join(ROOT, 'hosts');
var OUTPUT_FILE = path.join(HOSTS_DIR, 'manifest.json');
var IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

function listImageFiles(dir){
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(function(ent){ return ent.isFile() && IMAGE_EXT_RE.test(ent.name); })
    .map(function(ent){ return ent.name; })
    .sort(function(a, b){ return a.localeCompare(b, 'zh-Hant'); });
}

function build(){
  if(!fs.existsSync(HOSTS_DIR)){
    console.error('[build-host-manifest] 找不到 hosts/ 資料夾：' + HOSTS_DIR);
    process.exit(1);
  }

  var hosts = {};
  var entries = fs.readdirSync(HOSTS_DIR, { withFileTypes: true });

  entries.forEach(function(ent){
    if(ent.isDirectory()){
      var folderName = ent.name;
      var files = listImageFiles(path.join(HOSTS_DIR, folderName));
      if(files.length) hosts[folderName] = files;
    }
  });

  var manifest = {
    generatedAt: new Date().toISOString(),
    hosts: hosts
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('[build-host-manifest] 已寫入 ' + OUTPUT_FILE + '，共 ' + Object.keys(hosts).length + ' 位主持人。');
}

build();
