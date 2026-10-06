// Sessão simples por cookie assinado (HMAC). Senha única em ADMIN_PASSWORD.
const crypto = require('crypto');

const SESSION_MS = 12 * 60 * 60 * 1000;
const secret = () => process.env.ADMIN_PASSWORD || '';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const hmac = (ts) => crypto.createHmac('sha256', secret()).update('terra-admin.' + ts).digest('hex');

function enabled() { return secret().length > 0; }

function passwordOk(input) {
  return enabled() && crypto.timingSafeEqual(sha(input), sha(secret()));
}

function issue() { const ts = Date.now(); return ts + '.' + hmac(ts); }

function valid(token) {
  if (!enabled() || !token) return false;
  const i = token.indexOf('.');
  if (i < 1) return false;
  const ts = token.slice(0, i), sig = token.slice(i + 1);
  const age = Date.now() - Number(ts);
  if (!(age >= 0 && age < SESSION_MS)) return false;
  const a = Buffer.from(sig), b = Buffer.from(hmac(ts));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookieFrom(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('='));
  const hit = m.find((p) => p[0] === name);
  return hit ? hit.slice(1).join('=') : '';
}

// Limite de tentativas de login por IP (5 a cada 10 min).
const tries = new Map();
function throttled(ip) {
  const now = Date.now(), t = tries.get(ip) || { n: 0, reset: now + 600000 };
  if (now > t.reset) { t.n = 0; t.reset = now + 600000; }
  tries.set(ip, t);
  return t.n >= 5;
}
function fail(ip) { const t = tries.get(ip); if (t) t.n++; }
function ok(ip) { tries.delete(ip); }

module.exports = { SESSION_MS, enabled, passwordOk, issue, valid, cookieFrom, throttled, fail, ok };
