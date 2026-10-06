// Acesso ao Cloudflare R2 (API S3): conteúdo do quiz + biblioteca de mídias.
// O SDK só é carregado quando o R2 está configurado, então o site público nunca cai por causa dele.
const CONTENT_KEY = '_data/quiz.json';
const RESERVED = '_data/';
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
};

const env = process.env;
function status() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = need.filter((k) => !env[k]);
  return { ok: missing.length === 0, missing };
}

let sdk, s3;
function load() {
  if (!sdk) {
    sdk = Object.assign({}, require('@aws-sdk/client-s3'), { Upload: require('@aws-sdk/lib-storage').Upload });
    s3 = new sdk.S3Client({
      region: 'auto',
      endpoint: 'https://' + env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
      // O R2 não aceita os checksums automáticos novos do SDK.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return { sdk, s3 };
}
const Bucket = () => env.R2_BUCKET;
const notFound = (e) => e && (e.name === 'NoSuchKey' || e.name === 'NotFound' || (e.$metadata && e.$metadata.httpStatusCode === 404));

function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
function contentTypeOf(name) { return TYPES[extOf(name)] || null; }

// "Foto do Dourado (1).JPG" -> "foto-do-dourado-1.jpg"
function safeName(name) {
  const ext = extOf(name);
  const base = String(name).replace(/\.[^.]*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'arquivo';
  return base + '.' + ext;
}

let cache = null;
async function getContent() {
  if (cache && Date.now() - cache.at < 10000) return cache.data;
  const { sdk: k, s3: c } = load();
  try {
    const out = await c.send(new k.GetObjectCommand({ Bucket: Bucket(), Key: CONTENT_KEY }));
    const data = JSON.parse(await out.Body.transformToString());
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

async function putContent(obj) {
  const { sdk: k, s3: c } = load();
  await c.send(new k.PutObjectCommand({
    Bucket: Bucket(), Key: CONTENT_KEY, Body: JSON.stringify(obj, null, 2),
    ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
  }));
  cache = { at: Date.now(), data: obj };
}

async function listMedia() {
  const { sdk: k, s3: c } = load();
  const items = [];
  let token;
  do {
    const out = await c.send(new k.ListObjectsV2Command({ Bucket: Bucket(), ContinuationToken: token }));
    (out.Contents || []).forEach((o) => {
      if (o.Key.indexOf(RESERVED) === 0 || !contentTypeOf(o.Key)) return;
      items.push({ key: o.Key, size: o.Size, lastModified: o.LastModified });
    });
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  items.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return items;
}

async function exists(key) {
  const { sdk: k, s3: c } = load();
  try { await c.send(new k.HeadObjectCommand({ Bucket: Bucket(), Key: key })); return true; }
  catch (e) { if (notFound(e)) return false; throw e; }
}

async function upload(key, stream, contentType) {
  const { sdk: k, s3: c } = load();
  const up = new k.Upload({
    client: c, queueSize: 3, partSize: 8 * 1024 * 1024,
    params: { Bucket: Bucket(), Key: key, Body: stream, ContentType: contentType, CacheControl: 'public, max-age=3600' },
  });
  await up.done();
}

async function remove(key) {
  if (key.indexOf(RESERVED) === 0 || key.indexOf('..') >= 0) throw new Error('chave invalida');
  const { sdk: k, s3: c } = load();
  await c.send(new k.DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
}

module.exports = { status, getContent, putContent, listMedia, exists, upload, remove, safeName, extOf, contentTypeOf, TYPES };
