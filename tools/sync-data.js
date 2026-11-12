// prefectures.json の中身を index.html の <script id="pref-data"> に書き込む
// 使い方: node tools/sync-data.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const data = JSON.parse(fs.readFileSync(path.join(root, 'prefectures.json'), 'utf8'));
if (!Array.isArray(data.prefectures) || data.prefectures.length !== 47) throw new Error('prefectures.json に47県がそろっていません');
const html = fs.readFileSync(htmlPath, 'utf8');
const re = /(<script id="pref-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error('index.html に pref-data がありません');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
fs.writeFileSync(htmlPath, html.replace(re, `$1\n${json}\n$2`));
console.log('pref-data を更新しました(47県)');
