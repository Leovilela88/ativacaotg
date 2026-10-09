// Estrutura do conteúdo: 3 ativações fixas (cada uma com seu link, seus quizzes e seu ranking).
// Também converte o formato antigo (lista única de quizzes) para o novo, sem perder nada.
const ACTS = [
  { id: 'peixes', title: 'Ativação Peixes São Carlos' },
  { id: 'aves', title: 'Ativação Aves São Carlos' },
  { id: 'projeta', title: 'Ativação Projeta 2027' },
];
const IDS = ACTS.map((a) => a.id);
const LEGACY_TITLES = ['Ativação Projeta 2026'];

// Formato antigo: decide a ativação pelo id do quiz ("peixes", "aves") ou pelo título.
function legacyTarget(q) {
  const id = String((q && q.id) || '');
  if (IDS.indexOf(id) >= 0) return id;
  const t = String((q && q.title) || '').toLowerCase();
  if (/peix/.test(t)) return 'peixes';
  if (/\bave/.test(t)) return 'aves';
  return 'projeta';
}

function normalize(c) {
  c = c && typeof c === 'object' ? c : {};
  const byId = {};
  if (Array.isArray(c.activations)) {
    c.activations.forEach((a) => { if (a && IDS.indexOf(a.id) >= 0) byId[a.id] = a; });
  } else {
    (Array.isArray(c.quizzes) ? c.quizzes : []).forEach((q) => {
      const t = legacyTarget(q);
      (byId[t] = byId[t] || { id: t, quizzes: [] }).quizzes.push(q);
    });
  }
  const out = {
    activations: ACTS.map((d) => {
      const a = byId[d.id] || {};
      return Object.assign({}, a, {
        id: d.id,
        // titulos antigos que ja foram gravados no R2 viram o nome atual (ex.: "Projeta 2026" -> "Projeta 2027")
        title: (typeof a.title === 'string' && a.title.trim() && LEGACY_TITLES.indexOf(a.title.trim()) < 0 && a.title.trim()) || d.title,
        quizzes: Array.isArray(a.quizzes) ? a.quizzes : [],
      });
    }),
  };
  if (c.idleSeconds != null) out.idleSeconds = c.idleSeconds;
  return out;
}

function allQuizzes(c) { return [].concat.apply([], c.activations.map((a) => a.quizzes)); }

module.exports = { ACTS, IDS, normalize, allQuizzes };
