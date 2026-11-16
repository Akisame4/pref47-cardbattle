// prefectures.json と shapes.json の中身を index.html の <script id="pref-data"> / <script id="shape-data"> に書き込む
// 使い方: node tools/sync-data.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const data = JSON.parse(fs.readFileSync(path.join(root, 'prefectures.json'), 'utf8'));
if (!Array.isArray(data.prefectures) || data.prefectures.length !== 47) throw new Error('prefectures.json に47県がそろっていません');
const shapes = JSON.parse(fs.readFileSync(path.join(root, 'shapes.json'), 'utf8'));
if (Object.keys(shapes.shapes || {}).length !== 47) throw new Error('shapes.json に47県がそろっていません');
let html = fs.readFileSync(htmlPath, 'utf8');
function put(id, obj) {
  const re = new RegExp(`(<script id="${id}" type="application\\/json">)[\\s\\S]*?(<\\/script>)`);
  if (!re.test(html)) throw new Error(`index.html に ${id} がありません`);
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  html = html.replace(re, (_, a, b) => `${a}\n${json}\n${b}`);
}
put('pref-data', data);
put('shape-data', shapes);
fs.writeFileSync(htmlPath, html);
console.log('pref-data / shape-data を更新しました(47県)');
