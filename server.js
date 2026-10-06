// Servidor: site público (estático, com Range p/ vídeo) + API do admin (conteúdo e mídias no Cloudflare R2).
const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./lib/auth');
const store = require('./lib/store');
const ranking = require('./lib/ranking');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const MAX_UPLOAD = 300 * 1024 * 1024; // 300 MB por arquivo
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};

function sendJson(res, code, obj, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(JSON.stringify(obj));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('corpo grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON invalido')); } });
    req.on('error', reject);
  });
}

// Valida a estrutura do conteúdo antes de gravar (o app público depende dela).
function validateContent(c) {
  if (!c || !Array.isArray(c.quizzes) || c.quizzes.length > 50) return 'estrutura invalida';
  const kinds = ['image', 'video', 'audio', 'text'];
  for (const q of c.quizzes) {
    if (typeof q.id !== 'string' || typeof q.title !== 'string' || !q.title.trim()) return 'todo quiz precisa de titulo';
    if (!Array.isArray(q.questions)) return 'quiz sem lista de perguntas';
    if (q.muteVideos != null && typeof q.muteVideos !== 'boolean') return 'opcao de video invalida em "' + q.title + '"';
    if (q.timeLimit != null && !(Number.isInteger(q.timeLimit) && q.timeLimit >= 5 && q.timeLimit <= 300)) return 'tempo por pergunta invalido em "' + q.title + '" (5 a 300 s)';
    if (q.lifelines) for (const k of ['skip', 'fifty']) if (q.lifelines[k] != null && !(Number.isInteger(q.lifelines[k]) && q.lifelines[k] >= 0 && q.lifelines[k] <= 9)) return 'ajudas invalidas em "' + q.title + '"';
    for (const p of q.questions) {
      if (p.sound != null && typeof p.sound !== 'string') return 'audio invalido em "' + q.title + '"';
      if (typeof p.text !== 'string' || (!p.text.trim() && !p.sound)) return 'pergunta sem texto em "' + q.title + '"';
      if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 8 || p.options.some((o) => typeof o !== 'string' || !o.trim())) return 'alternativas invalidas em "' + q.title + '"';
      if (!Number.isInteger(p.answer) || p.answer < 0 || p.answer >= p.options.length) return 'resposta certa invalida em "' + q.title + '"';
      if (p.reward && (!kinds.includes(p.reward.type) || (p.reward.src && typeof p.reward.src !== 'string'))) return 'premio invalido em "' + q.title + '"';
    }
  }
  return null;
}

const FALLBACK = path.join(ROOT, 'data', 'quiz.json');
async function publicContent() {
  if (store.status().ok) {
    try { const c = await store.getContent(); if (c) return JSON.stringify(c); }
    catch (e) { console.error('R2 indisponivel, usando arquivo local:', e.message); }
  }
  return fs.readFileSync(FALLBACK, 'utf8');
}

// Limite simples por IP para rotas publicas (evita enchente de pontuacoes).
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const id = key + ip, now = Date.now(), h = hits.get(id) || { n: 0, reset: now + windowMs };
  if (now > h.reset) { h.n = 0; h.reset = now + windowMs; }
  h.n++; hits.set(id, h);
  return h.n > max;
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// Rotas abertas ao jogador: enviar pontuacao e ver ranking. Retorna true se tratou a requisicao.
async function publicApi(req, res, rel, url) {
  if (rel === '/api/ranking' && req.method === 'GET') {
    const content = JSON.parse(await publicContent());
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
    const only = url.searchParams.get('quizId');
    const out = {};
    for (const q of content.quizzes) if (!only || q.id === only) out[q.id] = await ranking.top(q.id, limit);
    sendJson(res, 200, { ranking: out });
    return true;
  }
  if (rel === '/api/score' && req.method === 'POST') {
    if (limited(clientIp(req), 'score', 30, 600000)) { sendJson(res, 429, { error: 'Muitas pontuacoes enviadas.' }); return true; }
    const b = await readJson(req, 2048);
    const content = JSON.parse(await publicContent());
    const quiz = content.quizzes.find((q) => q.id === b.quizId);
    const name = ranking.cleanName(b.name);
    const n = quiz ? quiz.questions.length : 0;
    const ok = quiz && name && [b.points, b.correct, b.total, b.ms].every(Number.isInteger)
      && b.total === n && b.correct >= 0 && b.correct <= n && b.points >= 0 && b.points <= 100 * n && b.ms >= 0 && b.ms <= 86400000;
    if (!ok) { sendJson(res, 400, { error: 'pontuacao invalida' }); return true; }
    sendJson(res, 200, await ranking.add(quiz.id, { name, points: b.points, correct: b.correct, total: b.total, ms: b.ms }));
    return true;
  }
  return false;
}

async function api(req, res, rel, url) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const secure = req.headers['x-forwarded-proto'] === 'https';
  const cookie = (v, age) => 'adm=' + v + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + age + (secure ? '; Secure' : '');

  if (!auth.enabled()) return sendJson(res, 503, { error: 'Admin desativado: defina a variavel ADMIN_PASSWORD no Railway.' });

  if (rel === '/api/login' && req.method === 'POST') {
    if (auth.throttled(ip)) return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const body = await readJson(req, 4096);
    if (!auth.passwordOk(body.password || '')) { auth.fail(ip); return sendJson(res, 401, { error: 'Senha incorreta.' }); }
    auth.ok(ip);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie(auth.issue(), auth.SESSION_MS / 1000) });
  }
  if (rel === '/api/logout' && req.method === 'POST') return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });

  if (!auth.valid(auth.cookieFrom(req, 'adm'))) return sendJson(res, 401, { error: 'Sessao expirada. Entre novamente.' });

  if (rel === '/api/status' && req.method === 'GET') {
    const s = store.status();
    return sendJson(res, 200, { r2: s.ok, missing: s.missing, mediaBase: (process.env.MEDIA_BASE_URL || '').replace(/\/+$/, '') });
  }

  if (rel === '/api/admin/ranking' && req.method === 'GET') {
    return sendJson(res, 200, { entries: await ranking.top(url.searchParams.get('quizId') || '', 5000) });
  }
  if (rel === '/api/ranking' && req.method === 'DELETE') {
    const quizId = url.searchParams.get('quizId') || '';
    if (url.searchParams.get('all')) await ranking.clear(quizId); else await ranking.remove(quizId, url.searchParams.get('id') || '');
    return sendJson(res, 200, { ok: true });
  }

  const s = store.status();
  if (!s.ok) return sendJson(res, 503, { error: 'R2 nao configurado. Faltam variaveis: ' + s.missing.join(', ') });

  if (rel === '/api/content' && req.method === 'GET') return sendJson(res, 200, JSON.parse(await publicContent()));
  if (rel === '/api/content' && req.method === 'PUT') {
    const body = await readJson(req, 1024 * 1024);
    const err = validateContent(body);
    if (err) return sendJson(res, 400, { error: err });
    await store.putContent(body);
    return sendJson(res, 200, { ok: true });
  }
  if (rel === '/api/media' && req.method === 'GET') return sendJson(res, 200, { items: await store.listMedia() });
  if (rel === '/api/media' && req.method === 'DELETE') {
    await store.remove(url.searchParams.get('key') || '');
    return sendJson(res, 200, { ok: true });
  }
  if (rel === '/api/upload' && req.method === 'POST') {
    const raw = url.searchParams.get('name') || '';
    const type = store.contentTypeOf(raw);
    if (!type) return sendJson(res, 415, { error: 'Formato nao suportado. Use jpg, png, webp, gif, mp4, webm, mp3, m4a, ogg ou wav.' });
    const len = Number(req.headers['content-length'] || 0);
    if (!len) return sendJson(res, 411, { error: 'Tamanho do arquivo ausente.' });
    if (len > MAX_UPLOAD) return sendJson(res, 413, { error: 'Arquivo acima de 300 MB.' });
    let key = store.safeName(raw);
    if (await store.exists(key)) key = key.replace(/(\.[a-z0-9]+)$/, '-' + Date.now().toString(36) + '$1');
    await store.upload(key, req, type);
    return sendJson(res, 200, { key });
  }
  return sendJson(res, 404, { error: 'rota inexistente' });
}

function serveStatic(req, res, rel) {
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '/admin') rel = '/admin.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // Código e conteúdo sempre revalidados (senão o aparelho segura versão antiga); só mídia fica em cache.
      'Cache-Control': ['.json', '.html', '.css', '.js'].includes(ext) ? 'no-cache, must-revalidate' : 'public, max-age=3600',
    };
    if (rel.indexOf('/admin') === 0) headers['X-Robots-Tag'] = 'noindex';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : 0;
      let end = range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (!range[1] && range[2]) { start = Math.max(0, st.size - end); end = st.size - 1; }
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end();
      }
      res.writeHead(206, Object.assign({}, headers, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign({}, headers, { 'Content-Length': st.size }));
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  let url, rel;
  try { url = new URL(req.url, 'http://x'); rel = decodeURIComponent(url.pathname); }
  catch (e) { res.writeHead(400); return res.end(); }

  try {
    if (rel === '/health') { res.writeHead(200); return res.end('ok'); }
    if (rel === '/config.js') {
      // Expõe só o endereço público das mídias (nunca chaves). Ex.: https://pub-xxxx.r2.dev
      let base = (process.env.MEDIA_BASE_URL || '').trim().replace(/\/+$/, '');
      if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache, must-revalidate' });
      return res.end('window.APP_CONFIG = ' + JSON.stringify({ mediaBase: base }) + ';');
    }
    if (rel === '/data/quiz.json') {
      const body = await publicContent();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, must-revalidate' });
      return res.end(body);
    }
    if (rel.indexOf('/api/') === 0) { if (await publicApi(req, res, rel, url)) return; return await api(req, res, rel, url); }
    return serveStatic(req, res, rel);
  } catch (e) {
    console.error(req.method, rel, e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro no servidor: ' + e.message });
    else res.end();
  }
}).listen(PORT, () => console.log(`ativacaotg rodando na porta ${PORT}`));
