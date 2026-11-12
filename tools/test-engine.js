// ルールエンジンをブラウザなしで確認する
// 使い方: node tools/test-engine.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx = { module: { exports: null } };
vm.runInNewContext(src, ctx);
const E = ctx.module.exports;
const PREFS = JSON.parse(fs.readFileSync(path.join(root, 'prefectures.json'), 'utf8')).prefectures;
const DB = E.makeDB(PREFS);
const byName = n => PREFS.find(p => p.name.startsWith(n)).no;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG:', msg); } }
function section(t) { console.log('■ ' + t); }
const fill = (arr, n) => { const out = arr.slice(); while (out.length < n) out.push(byName('鳥取')); return out; };
function game(d0, d1, config, extra = {}) {
  return E.createGame({ config, decks: [fill(d0, 40), fill(d1, 40)], seed: 1, shuffle: false, ...extra }).state;
}
function run(s, a) { const r = E.apply(s, a, DB); if (!r.ok) throw new Error(`${a.type}: ${r.error}`); return r.state; }
function err(s, a) { const r = E.apply(s, a, DB); return r.ok ? null : r.error; }
const handOf = (s, p, name) => s.players[p].hand.find(u => s.cards[u] === byName(name));
const unitOf = (s, p, name) => s.players[p].field.find(u => s.cards[u.cards[0]] === byName(name));

// ---- データ ----
section('データ');
ok(PREFS.length === 47, '47県');
const lv = {}; PREFS.forEach(p => lv[p.level] = (lv[p.level] || 0) + 1);
ok(lv[1] === 30 && lv[2] === 7 && lv[3] === 9 && lv[4] === 1, '星の内訳 30/7/9/1');
ok(DB[byName('東京')].attack === 120219900000000, '東京の攻撃力');
ok(DB[byName('群馬')].level === 1 && DB[byName('栃木')].level === 1 && DB[byName('茨城')].level === 2, '星1の線は群馬まで');

// ---- 開始 ----
section('開始');
let s = game([], []);
ok(s.players[0].hand.length === 5 && s.players[1].hand.length === 5, '手札5枚ずつ');
ok(s.players[0].deck.length === 35, '先攻は最初のドローなし');
ok(s.players[0].life === 600000000000000, 'ライフ600兆');
s = game([], [], { startHand: 7, firstPlayerDraws: true });
ok(s.players[0].hand.length === 8, '設定: 手札7 + 先攻ドロー');

// ---- 召喚 ----
section('召喚');
// P0 手札: 鳥取(星1) 秋田(星1) 宮城(星2) 北海道(星3) 東京(星4)
s = game([byName('鳥取'), byName('秋田'), byName('宮城'), byName('北海道'), byName('東京')], []);
ok(/生け贄が足りません/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '宮城'), tributes: [] })), '星2は生け贄なしでは出せない');
ok(err(s, { type: 'summon', player: 1, handUid: s.players[1].hand[0], tributes: [] }), '相手のターンには召喚できない');
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
ok(s.players[0].field.length === 1, '星1を生け贄なしで召喚');
ok(/もう召喚/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '秋田'), tributes: [] })), '1ターン1回まで');
s = run(s, { type: 'endTurn', player: 0 });
ok(s.players[1].hand.length === 6, '後攻はドローする');
s = run(s, { type: 'endTurn', player: 1 });
// P0: 場に鳥取。手札 秋田 宮城 北海道 東京 + ドロー1
const tottori = unitOf(s, 0, '鳥取').id;
ok(/組み合わせ/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '北海道'), tributes: [] })) || /足りません/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '北海道'), tributes: [] })), '星3は星1×1では出せない');
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '宮城'), tributes: [tottori] });
ok(s.players[0].field.length === 1 && unitOf(s, 0, '宮城'), '星1をリリースして星2');
ok(s.players[0].grave.length === 1, 'リリースした県は墓地へ');
// 星4: 星2×2 / 星3×1 / 星1×3
const info = E.summonInfo(s, 0, handOf(s, 0, '東京'), DB);
ok(!info.ok, '東京は星2×1だけでは出せない');
ok(E.describeCombos(s.config.tributeTable[4]) === '星1を3枚 / 星2を2枚 / 星3を1枚', '星4の生け贄表示');

// 設定: 召喚回数を増やして星3→東京
s = game([byName('鳥取'), byName('秋田'), byName('山形'), byName('北海道'), byName('東京')], [], { summonsPerTurn: 99 });
for (const n of ['鳥取', '秋田', '山形']) s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, n), tributes: [] });
ok(s.players[0].field.length === 3, '設定: 召喚回数を増やすと何体でも');
const ids3 = s.players[0].field.map(u => u.id);
ok(/2回/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '東京'), tributes: [ids3[0], ids3[0], ids3[1]] })), '同じ県の二重指定は不可');
const s4 = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '東京'), tributes: ids3 });
ok(s4.players[0].field.length === 1 && unitOf(s4, 0, '東京'), '星1×3で東京');
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '北海道'), tributes: [ids3[0], ids3[1]] });
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '東京'), tributes: [unitOf(s, 0, '北海道').id] });
ok(unitOf(s, 0, '東京') && s.players[0].field.length === 2, '星3×1で東京(山形は残る)');

// ---- 重ね ----
section('同じ県を重ねる');
s = game([byName('鳥取'), byName('鳥取'), byName('鳥取'), byName('鳥取'), byName('秋田')], [], { summonsPerTurn: 9 });
for (let i = 0; i < 3; i++) s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
let u = unitOf(s, 0, '鳥取');
ok(s.players[0].field.length === 1 && u.cards.length === 3, '3枚重ね');
ok(E.unitStats(s, u, DB).attack === DB[byName('鳥取')].attack * 2, '3枚で攻撃力2倍');
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
ok(E.unitStats(s, unitOf(s, 0, '鳥取'), DB).mult === 2, '4枚は仮で2倍');
s = game([byName('鳥取'), byName('鳥取')], [], { summonsPerTurn: 9, stackMultipliers: { 2: 10 } });
for (let i = 0; i < 2; i++) s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
ok(E.unitStats(s, unitOf(s, 0, '鳥取'), DB).attack === DB[byName('鳥取')].attack * 10, '設定: 倍率変更');

// ---- 戦闘 ----
section('戦闘');
const T = byName('東京'), H = byName('北海道'), TT = byName('鳥取');
// 東京を出して殴る準備: 召喚回数を増やし、星の制約は tributeTable で外す
const free = { summonsPerTurn: 9, tributeTable: { 1: [[]], 2: [[]], 3: [[]], 4: [[]] } };
s = game([T, TT], [H, TT], free);
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '東京'), tributes: [] });
s = run(s, { type: 'endTurn', player: 0 });
s = run(s, { type: 'summon', player: 1, handUid: handOf(s, 1, '北海道'), tributes: [] });
s = run(s, { type: 'endTurn', player: 1 });
ok(/バトルフェイズ/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: null })), 'メインでは攻撃できない');
s = run(s, { type: 'toBattle', player: 0 });
ok(/召喚はメイン/.test(err(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] })), 'バトル中は召喚できない');
ok(/直接攻撃できません/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: null })), '盾がいると直接攻撃不可');
const before = s.players[1].life;
const s0 = s;
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: unitOf(s, 1, '北海道').id });
ok(!unitOf(s, 1, '北海道'), '北海道が破壊');
ok(before - s.players[1].life === DB[T].attack - DB[H].defense, '差分がライフに入る');
ok(unitOf(s0, 1, '北海道') && s0.players[1].life === before, '元の state は変わらない(純粋)');
ok(/もう攻撃/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: null })), '1体1回');
s = run(s, { type: 'endTurn', player: 0 });
s = run(s, { type: 'endTurn', player: 1 });
s = run(s, { type: 'toBattle', player: 0 });
const lifeB = s.players[1].life;
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: null });
ok(lifeB - s.players[1].life === DB[T].attack, '直接攻撃は攻撃力そのまま');

// 攻撃力 < 防御力(防御力倍率で再現)
s = game([TT], [H], { ...free, defenseScale: 1000 });
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
s = run(s, { type: 'endTurn', player: 0 });
s = run(s, { type: 'summon', player: 1, handUid: handOf(s, 1, '北海道'), tributes: [] });
s = run(s, { type: 'endTurn', player: 1 });
s = run(s, { type: 'toBattle', player: 0 });
const lowS = s;
const myLife = s.players[0].life;
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '鳥取').id, targetId: unitOf(s, 1, '北海道').id });
ok(myLife - s.players[0].life === DB[H].defense * 1000 - DB[TT].attack, '低いと差分を攻撃側が受ける');
ok(unitOf(s, 0, '鳥取') && unitOf(s, 1, '北海道'), '仮: どちらも破壊されない');
const lowS2 = { ...lowS, config: { ...lowS.config, attackerDestroyedOnLowAttack: true, reflectDamageOnLowAttack: false } };
s = run(lowS2, { type: 'attack', player: 0, attackerId: unitOf(lowS2, 0, '鳥取').id, targetId: unitOf(lowS2, 1, '北海道').id });
ok(!unitOf(s, 0, '鳥取') && s.players[0].life === myLife, '設定: 攻撃側破壊・跳ね返りなし');

// 召喚ターン攻撃不可
s = game([TT], [], { canAttackOnSummonTurn: false });
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '鳥取'), tributes: [] });
s = run(s, { type: 'toBattle', player: 0 });
ok(/召喚したターン/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '鳥取').id, targetId: null })), '設定: 召喚ターンは攻撃不可');

// ---- 勝敗 ----
section('勝敗');
s = game([T], [], { ...free, startLife: 100 });
s = run(s, { type: 'summon', player: 0, handUid: handOf(s, 0, '東京'), tributes: [] });
s = run(s, { type: 'toBattle', player: 0 });
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '東京').id, targetId: null });
ok(s.phase === 'over' && s.winner === 0 && s.players[1].life === 0, 'ライフ0で勝ち');
ok(err(s, { type: 'endTurn', player: 1 }), '決着後は操作できない');
s = E.createGame({ config: { deckSize: 6, startHand: 5 }, decks: [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]], seed: 3 }).state;
s = run(s, { type: 'endTurn', player: 0 }); // P1 ドロー(残0)
s = run(s, { type: 'endTurn', player: 1 }); // P0 ドロー(残0)
s = run(s, { type: 'endTurn', player: 0 }); // P1 ドローできない
ok(s.phase === 'over' && s.winner === 0 && s.endReason === 'deckout', '山札切れで負け');
s = run(game([], []), { type: 'concede', player: 0 });
ok(s.winner === 1, '降参');

// ---- デッキ ----
section('デッキ');
const rd = E.randomDeck(PREFS, {}, 42);
ok(rd.length === 40 && E.validateDeck(rd, DB, {}).length === 0, 'ランダムデッキは40枚・同名4枚まで');
ok(E.validateDeck(Array(40).fill(1), DB, {}).length === 1, '同名5枚以上はエラー');

// ---- ランダム対戦(不変条件) ----
section('ランダム対戦 2000戦');
let turns = 0, ends = { life: 0, deckout: 0 }, crash = 0;
for (let g = 0; g < 2000; g++) {
  let rs = 1000 + g;
  const R = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  let st = E.createGame({ decks: [E.randomDeck(PREFS, {}, g), E.randomDeck(PREFS, {}, g + 7777)], seed: g }).state;
  const total = st.players.map(p => p.deck.length + p.hand.length);
  try {
    for (let step = 0; step < 2000 && st.phase !== 'over'; step++) {
      const p = st.active, pl = st.players[p];
      if (st.phase === 'main') {
        const cands = pl.hand.map(h => ({ h, i: E.summonInfo(st, p, h, DB) })).filter(x => x.i.ok);
        if (cands.length && R() < 0.9) {
          const c = cands[Math.floor(R() * cands.length)];
          const combo = c.i.combos[Math.floor(R() * c.i.combos.length)].slice();
          const tr = [];
          for (const lvN of combo) { const u2 = pl.field.find(f => !tr.includes(f.id) && DB[st.cards[f.cards[0]]].level === lvN); tr.push(u2.id); }
          st = run(st, { type: 'summon', player: p, handUid: c.h, tributes: tr });
        }
        st = run(st, { type: 'toBattle', player: p });
      }
      const op = st.players[1 - p];
      for (const u3 of st.players[p].field.slice()) {
        if (st.phase === 'over') break;
        if (!E.findUnit(st, p, u3.id)) continue;
        const tgt = op.field.length ? st.players[1 - p].field[Math.floor(R() * st.players[1 - p].field.length)] : null;
        if (st.players[1 - p].field.length && !tgt) continue;
        st = run(st, { type: 'attack', player: p, attackerId: u3.id, targetId: tgt ? tgt.id : null });
      }
      if (st.phase !== 'over') st = run(st, { type: 'endTurn', player: p });
      // カードの数は増えも減りもしない
      for (let i = 0; i < 2; i++) {
        const q = st.players[i];
        const n = q.deck.length + q.hand.length + q.grave.length + q.field.reduce((a, f) => a + f.cards.length, 0);
        if (n !== total[i]) throw new Error('カード枚数が合わない');
      }
    }
    if (st.phase === 'over') { ends[st.endReason]++; turns += st.turn; }
  } catch (e) { crash++; if (crash < 3) console.log('  ', e.message); }
}
ok(crash === 0, `ランダム対戦で例外 ${crash} 件`);
console.log(`  決着: ライフ ${ends.life} / 山札切れ ${ends.deckout}、平均 ${(turns / 2000).toFixed(1)} ターン`);

console.log(`\n${fail ? 'NG' : 'OK'}: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
