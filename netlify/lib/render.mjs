// Penyusun HTML di sisi SERVER (Server-Side Rendering).
// Tidak ada dependensi, jadi bisa dites dengan Node biasa.
const ST = ['belum', 'proses', 'selesai'];
const LBL = { belum: 'Belum', proses: 'Proses', selesai: 'Selesai' };

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const USER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';

function chips(t, dev) {
  return ST.map((s) =>
    '<label class="chip s-' + s + '"><input type="checkbox" data-status="' + s + '" data-id="' + esc(t.id) + '"' +
    (t.status === s ? ' checked' : '') + (dev ? '' : ' disabled') + '><span><b>' + LBL[s] + '</b></span></label>'
  ).join('');
}

function item(t, dev) {
  const st = ST.includes(t.status) ? t.status : 'belum';
  return '<li class="item st-' + st + '" data-id="' + esc(t.id) + '">' +
    '<div class="info"><div class="who">' + esc(t.name) + '</div><div class="what">' + esc(t.task) + '</div></div>' +
    '<div class="status" role="group" aria-label="Status ' + esc(t.name) + '">' + chips({ id: t.id, status: st }, dev) + '</div>' +
    (dev ? '<div class="acts"><button type="button" data-act="edit">Edit</button><button type="button" class="danger" data-act="del">Hapus</button></div>' : '') +
    '</li>';
}

// Bagian dinamis halaman (header + tab + daftar). Juga dipakai sebagai "fragmen" saat data berubah.
export function renderApp(db, activeId, dev) {
  const cats = db.categories;
  const cat = cats.find((c) => c.id === activeId) || cats[0];
  const act = cat ? cat.id : '';
  const items = db.tasks.filter((t) => t.cat === act);
  const c = { belum: 0, proses: 0, selesai: 0 };
  items.forEach((t) => { if (c[t.status] != null) c[t.status]++; });

  const tabs = cats.map((x) => {
    const n = db.tasks.filter((t) => t.cat === x.id && t.status !== 'selesai').length;
    return '<a class="tab" href="/?k=' + esc(x.id) + '" data-k="' + esc(x.id) + '"' + (x.id === act ? ' aria-current="true"' : '') + '>' +
      esc(x.name) + (n ? '<span class="n">' + n + '</span>' : '') + '</a>';
  }).join('') + (dev ? '<button type="button" class="tab plus" data-act="addcat" aria-label="Tambah kategori">+</button>' : '');

  return '<div id="app" data-active="' + esc(act) + '" data-dev="' + (dev ? '1' : '0') + '" data-catname="' + esc(cat ? cat.name : '') + '">' +
    '<header class="top"><h1>Job Desk</h1>' +
    (dev ? '<span id="modeBadge" class="badge">Mode dev</span>' : '') +
    '<div class="user"><button id="userBtn" class="icon-btn' + (dev ? ' on' : '') + '" type="button" aria-label="' + (dev ? 'Menu akun dev' : 'Masuk mode dev') + '" aria-haspopup="true">' + USER_ICON + '</button>' +
    (dev ? '<div id="userMenu" class="dropdown" hidden><button id="logoutBtn" type="button">Keluar dari mode dev</button></div>' : '') +
    '</div></header>' +
    '<nav id="tabs" class="tabs" aria-label="Kategori job desk">' + tabs + '</nav>' +
    '<main>' +
    (dev ? '<div id="catTools" class="cat-tools"><button id="renameCat" type="button" data-act="rename">Ganti nama kategori</button><button id="deleteCat" type="button" class="danger" data-act="delcat">Hapus kategori</button></div>' +
      '<form id="addForm" class="add" autocomplete="off"><input id="inName" type="text" placeholder="Nama" maxlength="60" required aria-label="Nama"><input id="inTask" type="text" placeholder="Tugas" maxlength="300" required aria-label="Tugas"><button class="primary" type="submit">Tambah tugas</button></form>' : '') +
    '<p id="summary" class="summary">' + (items.length ? 'Belum ' + c.belum + ' · Proses ' + c.proses + ' · Selesai ' + c.selesai : '') + '</p>' +
    '<ul id="list" class="list">' + items.map((t) => item(t, dev)).join('') + '</ul>' +
    (items.length ? '' : '<p id="empty" class="empty">' + (dev ? 'Belum ada tugas di kategori ini. Tambahkan lewat form di atas.' : 'Belum ada tugas di kategori ini.') + '</p>') +
    '</main></div>';
}

// Halaman lengkap
export function renderPage(db, activeId, dev) {
  return '<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="color-scheme" content="light dark">\n' +
    '<title>Job Desk Tim</title>\n' +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%233b4cca\'/%3E%3Cpath d=\'M9 16.5l4.5 4.5L23 11\' fill=\'none\' stroke=\'white\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E">\n' +
    '<link rel="stylesheet" href="/style.css">\n</head>\n<body>\n' +
    renderApp(db, activeId, dev) +
    '\n<dialog id="loginDlg">\n  <form id="loginForm" autocomplete="off">\n    <h2>Masuk mode dev</h2>\n    <p class="hint">Hanya dev yang bisa menambah dan mengubah tugas.</p>\n' +
    '    <input id="pw" type="password" placeholder="Password dev" maxlength="200" required aria-label="Password dev" autocomplete="current-password">\n' +
    '    <p id="loginErr" class="err" role="alert" hidden></p>\n    <div class="row">\n      <button type="button" id="loginCancel">Batal</button>\n      <button type="submit" class="primary">Masuk</button>\n    </div>\n  </form>\n</dialog>\n' +
    '<div id="toast" class="toast" role="status" hidden></div>\n<script src="/app.js" defer></script>\n</body>\n</html>\n';
}
