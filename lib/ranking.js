// Ranking por quiz. Guardado no R2 (_data/ranking.json); sem R2, fica em memória (some ao reiniciar).
const crypto = require('crypto');
const store = require('./store');

const KEY = '_data/ranking.json';
const MAX_PER_QUIZ = 2000;
let mem = {};
let chain = Promise.resolve();

// Serializa as gravações para dois jogadores simultâneos não se sobrescreverem.
function locked(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }

async function load() { return store.status().ok ? ((await store.getJson(KEY)) || {}) : mem; }
async function save(d) { if (store.status().ok) await store.putJson(KEY, d); else mem = d; }

// Mais pontos primeiro; empate: menor tempo total; depois quem chegou antes.
function order(a, b) { return b.points - a.points || a.ms - b.ms || a.at - b.at; }

function cleanName(n) {
  return String(n || '').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function add(quizId, e) {
  return locked(async () => {
    const d = await load();
    const list = d[quizId] || [];
    const entry = { id: crypto.randomBytes(5).toString('hex'), name: e.name, points: e.points, correct: e.correct, total: e.total, ms: e.ms, at: Date.now() };
    list.push(entry);
    list.sort(order);
    d[quizId] = list.slice(0, MAX_PER_QUIZ);
    await save(d);
    const rank = d[quizId].findIndex((x) => x.id === entry.id) + 1;
    return { id: entry.id, rank: rank || null, players: d[quizId].length };
  });
}

async function top(quizId, limit) {
  const d = await load();
  return (d[quizId] || []).slice(0, limit);
}

function remove(quizId, id) {
  return locked(async () => {
    const d = await load();
    d[quizId] = (d[quizId] || []).filter((x) => x.id !== id);
    await save(d);
  });
}
function clear(quizId) { return locked(async () => { const d = await load(); delete d[quizId]; await save(d); }); }

module.exports = { add, top, remove, clear, cleanName };
