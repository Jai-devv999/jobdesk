// Server-Side Rendering: HTML halaman disusun di server (Netlify Function, gratis),
// browser hanya menerima halaman jadi. Data diambil dari Netlify Blobs yang sama dengan api.mjs.
import { getStore } from '@netlify/blobs';
import { renderApp, renderPage } from '../lib/render.mjs';

export const config = { path: '/' };

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
function cookie(req, name) {
  for (const c of (req.headers.get('cookie') || '').split(';')) {
    const i = c.indexOf('=');
    if (i > 0 && c.slice(0, i).trim() === name) return c.slice(i + 1).trim();
  }
  return '';
}
async function isDev(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return false;
  const [exp, n, sig] = cookie(req, 'sid').split('.');
  if (!exp || !n || !sig || !(+exp > Date.now())) return false;
  return eq(sig, await hmac(secret, exp + '.' + n));
}
async function load() {
  const store = getStore({ name: 'jobdesk', consistency: 'strong' });
  try {
    const d = JSON.parse(await store.get('db'));
    if (Array.isArray(d.categories) && Array.isArray(d.tasks)) return d;
  } catch (e) { /* data belum ada */ }
  const d = { categories: ['Postingan IG', 'Konten Video', 'Desain', 'Umum'].map((name) => ({ id: uid(), name })), tasks: [] };
  await store.set('db', JSON.stringify(d));
  return d;
}

const SEC = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'private, no-store',
};

export default async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405 });
  try {
    const url = new URL(request.url);
    const k = url.searchParams.get('k') || '';
    const [db, dev] = await Promise.all([load(), isDev(request)]);
    // frag=1 -> hanya bagian dinamis (dipakai JS setelah klik/ubah data)
    if (url.searchParams.get('frag') === '1')
      return new Response(renderApp(db, k, dev), { headers: { ...SEC, 'Content-Type': 'text/html; charset=utf-8' } });
    return new Response(renderPage(db, k, dev), { headers: { ...SEC, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return new Response('Kesalahan server', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
};
