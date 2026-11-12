// Backend Job Desk untuk Netlify Functions (gratis). Data disimpan di Netlify Blobs.
// Butuh environment variable ADMIN_PASSWORD dan SESSION_SECRET (diisi di dashboard, TIDAK di kode).
import { getStore } from '@netlify/blobs';

const store = () => getStore({ name: 'jobdesk', consistency: 'strong' });
const kv = {
  get: (k) => store().get(k),
  put: (k, v) => store().set(k, v),
  delete: (k) => store().delete(k),
};
export const config = { path: '/api/*' };
export default async (request, context) =>
  onRequest({ request, ip: (context && context.ip) || 'x', env: { JOBDESK: kv, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, SESSION_SECRET: process.env.SESSION_SECRET } });

const STATUS = ['belum', 'proses', 'selesai'];
const HOURS = 8;
const enc = new TextEncoder();
const uid = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function eq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function clean(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s && s.length <= max ? s : null;
}
function cookie(req, name) {
  for (const c of (req.headers.get('cookie') || '').split(';')) {
    const i = c.indexOf('=');
    if (i > 0 && c.slice(0, i).trim() === name) return c.slice(i + 1).trim();
  }
  return '';
}
function json(code, obj, extra) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra),
  });
}
async function isDev(req, env) {
  const t = cookie(req, 'sid');
  const [exp, n, sig] = t.split('.');
  if (!exp || !n || !sig || !(+exp > Date.now())) return false;
  return eq(sig, await hmac(env.SESSION_SECRET, exp + '.' + n));
}
async function load(env) {
  try {
    const d = JSON.parse(await env.JOBDESK.get('db'));
    if (Array.isArray(d.categories) && Array.isArray(d.tasks)) return d;
  } catch (e) { /* data belum ada */ }
  const d = { categories: ['Postingan IG', 'Konten Video', 'Desain', 'Umum'].map((name) => ({ id: uid(), name })), tasks: [] };
  await env.JOBDESK.put('db', JSON.stringify(d)); // simpan agar id kategori tetap
  return d;
}
const save = (env, db) => env.JOBDESK.put('db', JSON.stringify(db));

async function onRequest({ request, env, ip }) {
  try {
    if (!env.JOBDESK || !env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 16)
      return json(500, { error: 'Server belum dikonfigurasi (KV / secret)' });
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;

    if (m === 'GET' && p === '/api/data') return json(200, await load(env));
    if (m === 'GET' && p === '/api/me') return json(200, { dev: await isDev(request, env) });
    if (m === 'GET' || m === 'HEAD') return json(404, { error: 'Tidak ditemukan' });

    // CSRF: header khusus + JSON + origin sama
    if (request.headers.get('x-requested-with') !== 'fetch' || !/^application\/json/.test(request.headers.get('content-type') || ''))
      return json(403, { error: 'Permintaan ditolak' });
    const origin = request.headers.get('origin');
    if (origin) { let h = ''; try { h = new URL(origin).host; } catch (e) {} if (h !== url.host) return json(403, { error: 'Permintaan ditolak' }); }

    const text = await request.text();
    if (text.length > 10240) return json(413, { error: 'Data terlalu besar' });
    let b = {};
    try { b = JSON.parse(text || '{}'); } catch (e) { return json(400, { error: 'Format salah' }); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) b = {};
    const secure = url.protocol === 'https:' ? '; Secure' : '';

    if (m === 'POST' && p === '/api/login') {
            const key = 'rl:' + ip;
      const rl = JSON.parse((await env.JOBDESK.get(key)) || '{"n":0,"until":0}');
      if (rl.until > Date.now()) return json(429, { error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
      const pw = typeof b.password === 'string' && b.password.length > 0 && b.password.length <= 200 ? b.password : null;
      const ok = pw !== null && eq(await hmac(env.SESSION_SECRET, 'pw:' + pw), await hmac(env.SESSION_SECRET, 'pw:' + env.ADMIN_PASSWORD));
      if (!ok) {
        rl.n++;
        if (rl.n >= 5) { rl.until = Date.now() + 15 * 60e3; rl.n = 0; }
        await env.JOBDESK.put(key, JSON.stringify(rl));
        await new Promise((r) => setTimeout(r, 600));
        return json(401, { error: 'Password salah' });
      }
      await env.JOBDESK.delete(key);
      const exp = Date.now() + HOURS * 3600e3, n = uid();
      const tok = exp + '.' + n + '.' + (await hmac(env.SESSION_SECRET, exp + '.' + n));
      return json(200, { dev: true }, { 'Set-Cookie': `sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${HOURS * 3600}${secure}` });
    }
    if (m === 'POST' && p === '/api/logout')
      return json(200, { dev: false }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure });

    // ---- semua di bawah ini khusus dev ----
    if (!(await isDev(request, env))) return json(401, { error: 'Perlu login dev' });
    const db = await load(env);
    let r;

    if (m === 'POST' && p === '/api/categories') {
      const name = clean(b.name, 40);
      if (!name) return json(400, { error: 'Nama kategori tidak valid' });
      if (db.categories.length >= 20) return json(400, { error: 'Maksimal 20 kategori' });
      const c = { id: uid(), name }; db.categories.push(c);
      await save(env, db); return json(201, c);
    }
    if ((r = p.match(/^\/api\/categories\/([0-9a-f]{12})$/))) {
      const c = db.categories.find((x) => x.id === r[1]);
      if (!c) return json(404, { error: 'Kategori tidak ada' });
      if (m === 'PATCH') {
        const name = clean(b.name, 40);
        if (!name) return json(400, { error: 'Nama kategori tidak valid' });
        c.name = name; await save(env, db); return json(200, c);
      }
      if (m === 'DELETE') {
        if (db.categories.length <= 1) return json(400, { error: 'Minimal harus ada 1 kategori' });
        db.categories = db.categories.filter((x) => x.id !== c.id);
        db.tasks = db.tasks.filter((t) => t.cat !== c.id);
        await save(env, db); return json(200, { ok: true });
      }
    }
    if (m === 'POST' && p === '/api/tasks') {
      const name = clean(b.name, 60), task = clean(b.task, 300);
      if (!name || !task || !db.categories.some((c) => c.id === b.cat)) return json(400, { error: 'Data tugas tidak valid' });
      if (db.tasks.length >= 2000) return json(400, { error: 'Jumlah tugas sudah maksimal' });
      const t = { id: uid(), cat: b.cat, name, task, status: 'belum', ts: Date.now() };
      db.tasks.push(t); await save(env, db); return json(201, t);
    }
    if ((r = p.match(/^\/api\/tasks\/([0-9a-f]{12})$/))) {
      const t = db.tasks.find((x) => x.id === r[1]);
      if (!t) return json(404, { error: 'Tugas tidak ada' });
      if (m === 'PATCH') {
        if ('name' in b) { const v = clean(b.name, 60); if (!v) return json(400, { error: 'Nama tidak valid' }); t.name = v; }
        if ('task' in b) { const v = clean(b.task, 300); if (!v) return json(400, { error: 'Tugas tidak valid' }); t.task = v; }
        if ('status' in b) { if (!STATUS.includes(b.status)) return json(400, { error: 'Status tidak valid' }); t.status = b.status; }
        await save(env, db); return json(200, t);
      }
      if (m === 'DELETE') { db.tasks = db.tasks.filter((x) => x.id !== t.id); await save(env, db); return json(200, { ok: true }); }
    }
    return json(404, { error: 'Tidak ditemukan' });
  } catch (e) {
    return json(500, { error: 'Kesalahan server' });
  }
}
