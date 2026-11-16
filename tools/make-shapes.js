// 都道府県の輪郭(GeoJSON)から、カードに描く県の形(SVG path)を作って shapes.json に書く
// 出典: 地球地図日本(国土地理院) を dataofjapan/land が GeoJSON にしたもの
// 使い方: node tools/make-shapes.js <japan.geojson のパス>  → そのあと node tools/sync-data.js
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
if (!src) throw new Error('japan.geojson のパスを指定してください');
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
const SIZE = 100;          // viewBox 0 0 100 100
const KEEP_AREA = 0.004;   // いちばん大きい島に対してこれより小さい島は描かない
const NEAR = 0.35;         // 本体の大きさに対して、これより遠い島は描かない(東京の小笠原など)

function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }
function bbox(pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; }
function gap(a, b) { const dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dy = Math.max(0, a[1] - b[3], b[1] - a[3]); return Math.hypot(dx, dy); }
function dp(pts, eps) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let best = -1, bi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) // 閉じた輪の始点=終点
        : Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const out = {};
for (const f of geo.features) {
  const id = f.properties.id;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // 経度を緯度に合わせて縮め、y を下向きにする
  const lat0 = polys[0][0].reduce((s, p) => s + p[1], 0) / polys[0][0].length;
  const k = Math.cos(lat0 * Math.PI / 180);
  let rings = polys.map(p => p[0].map(([x, y]) => [x * k, -y]));
  rings = rings.map(r => ({ r, a: ringArea(r), b: bbox(r) })).sort((p, q) => q.a - p.a);
  const main = rings[0], mb = main.b, msize = Math.max(mb[2] - mb[0], mb[3] - mb[1]);
  rings = rings.filter(x => x.a >= main.a * KEEP_AREA && gap(x.b, mb) <= msize * NEAR);
  const all = bbox(rings.flatMap(x => x.r));
  const w = all[2] - all[0], h = all[3] - all[1], s = (SIZE - 8) / Math.max(w, h);
  const ox = (SIZE - w * s) / 2, oy = (SIZE - h * s) / 2;
  const d = rings.map(x => {
    const pts = dp(x.r.map(([px, py]) => [(px - all[0]) * s + ox, (py - all[1]) * s + oy]), 0.5);
    const q = []; for (const [px, py] of pts) { const t = [Math.round(px * 10) / 10, Math.round(py * 10) / 10]; const l = q[q.length - 1]; if (!l || l[0] !== t[0] || l[1] !== t[1]) q.push(t); }
    return q.length >= 3 ? 'M' + q.map(p => p.join(' ')).join('L') + 'Z' : '';
  }).join('');
  out[id] = d;
}
if (Object.keys(out).length !== 47) throw new Error('47県そろっていません: ' + Object.keys(out).length);
const file = path.join(__dirname, '..', 'shapes.json');
fs.writeFileSync(file, JSON.stringify({ _note: '県の形(SVG path, viewBox 0 0 100 100)。出典: 地球地図日本(国土地理院)。tools/make-shapes.js で作成', shapes: out }) + '\n');
console.log('shapes.json', fs.statSync(file).size, 'bytes');
