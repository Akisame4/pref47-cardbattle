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
// ---- マジック・フィールド ----
section('マジック・フィールド');
const handId = (s, p, id) => s.players[p].hand.find(u => s.cards[u] === id);
const cast = (s, p, id, choice) => run(s, { type: 'cast', player: p, handUid: handId(s, p, id), choice });
const castErr = (s, p, id, choice) => err(s, { type: 'cast', player: p, handUid: handId(s, p, id), choice });
const FREE = { summonsPerTurn: 99, magicLimit: null, startHand: 10, tributeTable: { 1: [[]], 2: [[]], 3: [[]], 4: [[]] } };
const summonAll = (s, p, names) => { for (const n of names) s = run(s, { type: 'summon', player: p, handUid: handOf(s, p, n), tributes: [] }); return s; };
ok(E.SPELLS.filter(c => c.kind === 'magic').length === 10 && E.SPELLS.filter(c => c.kind === 'field').length === 3, 'マジック10枚・フィールド3枚');
ok(E.SPELLS.every(c => DB[c.id] === c), 'DB にカードが入っている');

// 枚数制限: 2枚まで、相手のターンに使った分も同じ枠
s = game(['m_kannazuki', 'm_kannazuki', 'm_kannazuki', TT], ['m_kannazuki', TT], { summonsPerTurn: 9 });
s = summonAll(s, 0, ['鳥取']);
s = cast(s, 0, 'm_kannazuki');
s = cast(s, 0, 'm_kannazuki');
ok(/もう使えません/.test(castErr(s, 0, 'm_kannazuki')), 'マジックは2枚まで');
ok(E.unitStats(s, unitOf(s, 0, '鳥取'), DB).attack === DB[TT].attack * 2.25, '神無月を2回で2.25倍');
s = run(s, { type: 'endTurn', player: 0 });
ok(/もう使えません/.test(castErr(s, 0, 'm_kannazuki')), '相手のターンにも同じ枠(まだ2/2)');
s = run(s, { type: 'endTurn', player: 1 });
s = cast(s, 0, 'm_kannazuki');
ok(s.players[0].magicUsed === 1, '自分のターン開始で枠が戻る');
s = game(['m_kannazuki', TT], [TT], { summonsPerTurn: 9 });
s = run(s, { type: 'endTurn', player: 0 });
s = summonAll(s, 1, ['鳥取']);
s = run(s, { type: 'endTurn', player: 1 });
s = summonAll(s, 0, ['鳥取']);
s = run(s, { type: 'endTurn', player: 0 });
s = cast(s, 0, 'm_kannazuki');
ok(s.players[0].magicUsed === 1 && s.active === 1, '相手のターンにも使える(速攻魔法)');

// 北関東最弱連合軍
s = game([byName('栃木'), 'm_kitakanto', 'm_kitakanto', byName('茨城'), byName('埼玉')], [], { ...FREE, startHand: 4 });
// 山札: 茨城(手札にいる)・埼玉は山札、群馬は無い → 群馬を足す
s = E.createGame({ config: { ...FREE, startHand: 4 }, decks: [fill([byName('栃木'), 'm_kitakanto', 'm_kitakanto', byName('茨城'), byName('埼玉'), byName('群馬')], 40), fill([], 40)], seed: 1, shuffle: false }).state;
s = summonAll(s, 0, ['栃木']);
s = cast(s, 0, 'm_kitakanto');
ok(unitOf(s, 0, '茨城') && unitOf(s, 0, '群馬') && s.players[0].summonsUsed === 1, '残りの2県を特殊召喚(召喚回数は使わない)');
s = cast(s, 0, 'm_kitakanto');
ok(unitOf(s, 0, '埼玉') && !unitOf(s, 0, '栃木') && s.players[0].field.length === 1, '3県をリリースして埼玉');
s = game([byName('鳥取'), 'm_kitakanto'], [], FREE);
ok(/どれか/.test(castErr(s, 0, 'm_kitakanto')), '北関東がいないと使えない');

// 七大都市
const seven = ['北海道', '宮城', '東京', '神奈川', '愛知', '大阪', '福岡'];
s = game([...seven.map(byName), 'm_seven'], [], FREE);
s = summonAll(s, 0, seven.slice(0, 6));
ok(/福岡/.test(castErr(s, 0, 'm_seven')), '1県足りないと使えない(足りない県を表示)');
s = summonAll(s, 0, ['福岡']);
s = cast(s, 0, 'm_seven');
ok(s.phase === 'over' && s.winner === 0 && s.endReason === 'sevenCities', '7県そろって勝利');

// 住みたくない県の底力
s = game([byName('栃木'), byName('茨城'), byName('群馬'), 'm_sumitakunai', TT, TT, TT, TT, TT, TT, 'm_food', 'm_inaka', 'f_snow', 'm_kannazuki'], [], FREE);
s = summonAll(s, 0, ['栃木', '茨城', '群馬']);
const handBefore = s.players[0].hand.length;
s = cast(s, 0, 'm_sumitakunai');
const added = s.players[0].hand.slice(-3).map(u => s.cards[u]);
ok(s.players[0].field.length === 0 && s.players[0].hand.length === handBefore - 1 + 3, '3体リリースして3枚加える');
ok(added.every(id => DB[id].kind === 'magic'), '加わるのはマジック(フィールドは除く)');

// お好み焼き
s = game([byName('大阪'), byName('広島'), 'm_okonomi', 'm_okonomi'], [], FREE);
s = summonAll(s, 0, ['大阪']);
s = cast(s, 0, 'm_okonomi');
ok(E.unitStats(s, unitOf(s, 0, '大阪'), DB).attack === DB[byName('大阪')].attack * 2, '大阪だけなら2倍');
s = summonAll(s, 0, ['広島']);
ok(E.castInfo(s, 0, handId(s, 0, 'm_okonomi'), DB).options.length === 2, '両方いると2択');
s = cast(s, 0, 'm_okonomi', 'keepHiroshima');
ok(!unitOf(s, 0, '大阪') && E.unitStats(s, unitOf(s, 0, '広島'), DB).attack === DB[byName('広島')].attack * 4, '大阪を墓地へ、広島4倍');

// 鳥取と島根
s = game([TT, 'm_tottori'], [T], FREE);
s = summonAll(s, 0, ['鳥取']);
s = cast(s, 0, 'm_tottori');
s = run(s, { type: 'endTurn', player: 0 });
s = summonAll(s, 1, ['東京']);
s = run(s, { type: 'toBattle', player: 1 });
s = run(s, { type: 'attack', player: 1, attackerId: unitOf(s, 1, '東京').id, targetId: unitOf(s, 0, '鳥取').id });
ok(unitOf(s, 0, '鳥取') && s.players[0].barrier === 0, '攻撃を1回無効');

// 食料の底力・地方最高!
s = game([byName('北海道'), TT, 'm_food', 'm_inaka'], [], FREE);
s = summonAll(s, 0, ['北海道', '鳥取']);
s = cast(s, 0, 'm_food');
let hk = E.unitStats(s, unitOf(s, 0, '北海道'), DB);
ok(hk.attack === Math.round(DB[1].attack * 1.5) && hk.defense === Math.round(DB[1].defense * 1.5), '農産物の県は攻防1.5倍');
ok(E.unitStats(s, unitOf(s, 0, '鳥取'), DB).attack === DB[TT].attack * (DB[TT].tags.includes('農産物') ? 1.5 : 1), '農産物でない県は変わらない');
s = cast(s, 0, 'm_inaka');
ok(E.unitStats(s, unitOf(s, 0, '鳥取'), DB).attack === Math.round(DB[TT].attack * 1.5), '田舎の鳥取は1.5倍');

// 神無月(島根で2倍)
s = game([byName('島根'), 'm_kannazuki'], [], FREE);
s = summonAll(s, 0, ['島根']);
s = cast(s, 0, 'm_kannazuki');
ok(E.unitStats(s, unitOf(s, 0, '島根'), DB).attack === DB[byName('島根')].attack * 2, '島根がいれば2倍');

// 新幹線開業
s = game([byName('宮城'), TT, 'm_shinkansen'], [], FREE);
s = summonAll(s, 0, ['宮城', '鳥取']);
s = run(s, { type: 'toBattle', player: 0 });
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '宮城').id, targetId: null });
s = cast(s, 0, 'm_shinkansen');
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '宮城').id, targetId: null });
ok(/もう攻撃/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '宮城').id, targetId: null })), '新幹線の県は2回まで');
s = run(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '鳥取').id, targetId: null });
ok(/もう攻撃/.test(err(s, { type: 'attack', player: 0, attackerId: unitOf(s, 0, '鳥取').id, targetId: null })), '駅のない鳥取は1回');

// 国内線需要増加
s = game(['m_kokunaisen', 'm_kannazuki', 'm_kannazuki', 'm_kannazuki', TT], [], { summonsPerTurn: 9 });
s = summonAll(s, 0, ['鳥取']);
s = cast(s, 0, 'm_kokunaisen');
s = cast(s, 0, 'm_kannazuki'); s = cast(s, 0, 'm_kannazuki'); s = cast(s, 0, 'm_kannazuki');
ok(s.players[0].magicUsed === 4, '上限+2で計4枚');

// フィールド
s = game([byName('大阪'), 'f_typhoon', 'f_snow'], ['f_heat', TT], FREE);
s = summonAll(s, 0, ['大阪']);
s = cast(s, 0, 'f_typhoon');
ok(E.unitStats(s, unitOf(s, 0, '大阪'), DB).attack === DB[27].attack / 2, '台風で大阪は半分');
ok(/もう出しました/.test(castErr(s, 0, 'f_snow')), 'フィールドは1ターン1枚');
s = run(s, { type: 'endTurn', player: 0 });
ok(/自分のターン/.test(castErr(s, 0, 'f_snow')), '相手のターンにフィールドは出せない');
s = cast(s, 1, 'f_heat');
ok(s.cards[s.field.uid] === 'f_heat' && s.players[0].grave.some(u => s.cards[u] === 'f_typhoon'), '上書きで前のフィールドは持ち主の墓地へ');
ok(E.unitStats(s, unitOf(s, 0, '大阪'), DB).attack === Math.round(DB[27].attack * 0.7), '猛暑日で都心の大阪は0.7倍');
ok(s.players[1].magicUsed === 0, 'フィールドはマジックの枠を使わない');

const rd2 = E.randomDeck(PREFS, {}, 5);
ok(rd2.filter(x => typeof x === 'string').length === 10 && E.validateDeck(rd2, DB, {}).length === 0, 'ランダムデッキはマジック等10枚入り');

section('ランダム対戦 2000戦');
let turns = 0, ends = { life: 0, deckout: 0, sevenCities: 0 }, crash = 0, spellsCast = 0;
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
        for (let k = 0; k < 3 && st.phase !== 'over'; k++) { // 使えるマジック・フィールドを適当に使う
          for (const q of [p, 1 - p]) {
            const cs = st.players[q].hand.map(h => ({ h, i: E.castInfo(st, q, h, DB) })).filter(x => x.i.ok);
            if (cs.length && R() < 0.5) { const c = cs[Math.floor(R() * cs.length)]; st = run(st, { type: 'cast', player: q, handUid: c.h, choice: c.i.options[Math.floor(R() * c.i.options.length)].choice }); spellsCast++; }
          }
        }
        if (st.phase === 'over') break;
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
        const n = q.deck.length + q.hand.length + q.grave.length + q.field.reduce((a, f) => a + f.cards.length, 0) + (st.field && st.field.owner === i ? 1 : 0);
        if (n !== total[i]) throw new Error('カード枚数が合わない');
      }
    }
    if (st.phase === 'over') { ends[st.endReason]++; turns += st.turn; }
  } catch (e) { crash++; if (crash < 3) console.log('  ', e.message); }
}
ok(crash === 0, `ランダム対戦で例外 ${crash} 件`);
console.log(`  決着: ライフ ${ends.life} / 山札切れ ${ends.deckout} / 七大都市 ${ends.sevenCities}、平均 ${(turns / 2000).toFixed(1)} ターン、マジック等 ${spellsCast} 回`);

// ---- オンライン: 隠す情報 ----
// 操作する側は「公開 state + 自分の秘密」しか持たない。それでも全部知っている場合と同じ結果になるか
section('オンライン(手札・山札を隠す)');
{
  let hidOk = 0, hidNg = 0, leak = 0, hidGames = 0;
  for (let g = 0; g < 300; g++) {
    let rs = 5000 + g;
    const R = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    const created = E.createGame({ hiddenDecks: [40, 40], seed: g, firstPlayer: g & 1 });
    // 各自の秘密: uid → カード(各自で混ぜた順)
    const secret = [0, 1].map(i => {
      const d = E.randomDeck(PREFS, {}, g * 3 + i), m = {};
      created.state.players[i].deck.forEach((u, k) => { m[u] = d[k]; });
      return m;
    });
    let pub = E.publicState(created.state);
    ok(Object.keys(pub.cards).length === 0 || g > 0, '開始時は何も公開されていない');
    const full = () => E.withSecret(pub, Object.assign({}, secret[0], secret[1]));
    const step = a => {
      const mine = E.withSecret(pub, secret[a.player]);
      const r1 = E.apply(mine, a, DB), r2 = E.apply(full(), a, DB);
      if (r1.ok !== r2.ok) { hidNg++; return false; }
      if (!r1.ok) return false;
      const p1 = E.publicState(r1.state), p2 = E.publicState(r2.state);
      if (JSON.stringify(p1) === JSON.stringify(p2)) hidOk++; else hidNg++;
      // 公開 state・公開イベントに、手札・山札の中身が漏れていない
      const hid = E.hiddenUids(p1);
      if (Object.keys(p1.cards).some(u => hid.has(u))) leak++;
      if (E.publicEvents(r1.state, r1.events).some(e => e.uid && hid.has(e.uid) && (e.no != null || e.id != null))) leak++;
      pub = p1;
      return true;
    };
    try {
      for (let n = 0; n < 600 && pub.phase !== 'over'; n++) {
        const p = pub.active, st = full();
        const pl = st.players[p];
        if (st.phase === 'main') {
          const cands = pl.hand.map(h => ({ h, i: E.summonInfo(st, p, h, DB) })).filter(x => x.i.ok);
          if (cands.length && R() < 0.9) {
            const c = cands[Math.floor(R() * cands.length)];
            const tr = [];
            for (const lvN of c.i.combos[Math.floor(R() * c.i.combos.length)]) { const u2 = pl.field.find(f => !tr.includes(f.id) && DB[st.cards[f.cards[0]]].level === lvN); tr.push(u2.id); }
            step({ type: 'summon', player: p, handUid: c.h, tributes: tr });
            continue;
          }
          const q = R() < 0.3 ? 1 - p : p; // 割り込みも混ぜる
          const cs = full().players[q].hand.map(h => ({ h, i: E.castInfo(full(), q, h, DB) })).filter(x => x.i.ok);
          if (cs.length && R() < 0.4) { const c = cs[Math.floor(R() * cs.length)]; step({ type: 'cast', player: q, handUid: c.h, choice: c.i.options[Math.floor(R() * c.i.options.length)].choice }); continue; }
          step({ type: 'toBattle', player: p });
          continue;
        }
        const ready = pub.players[p].field.filter(u => !E.canAttackReason(pub, p, u));
        if (ready.length && R() < 0.9) {
          const opf = pub.players[1 - p].field;
          step({ type: 'attack', player: p, attackerId: ready[0].id, targetId: opf.length ? opf[Math.floor(R() * opf.length)].id : null });
        } else step({ type: 'endTurn', player: p });
      }
      hidGames++;
    } catch (e) { hidNg++; if (hidNg < 3) console.log('  ', e.message); }
  }
  ok(hidNg === 0, `秘密なしでも同じ結果 (一致 ${hidOk} / 不一致 ${hidNg})`);
  ok(leak === 0, `手札・山札の中身が公開側に漏れていない (漏れ ${leak})`);
  console.log(`  ${hidGames}戦・${hidOk}操作で確認`);
}

console.log(`\n${fail ? 'NG' : 'OK'}: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
