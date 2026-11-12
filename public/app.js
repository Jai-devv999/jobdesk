(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var ST = ['belum', 'proses', 'selesai'];
  var LBL = { belum: 'Belum', proses: 'Proses', selesai: 'Selesai' };
  var S = { cats: [], tasks: [], active: null, dev: false, edit: null, draft: { name: '', task: '' } };

  // ---------- helper ----------
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // selalu textContent -> aman dari XSS
    return e;
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          if (r.status === 401 && S.dev && url !== '/api/login') { S.dev = false; S.edit = null; render(); }
          throw new Error(d.error || 'Terjadi kesalahan');
        }
        return d;
      });
    });
  }
  function act(p) {
    return p.then(load).catch(function (e) { toast(e.message); });
  }

  // ---------- data ----------
  function load() {
    return api('GET', '/api/data').then(function (d) {
      S.cats = d.categories || []; S.tasks = d.tasks || [];
      if (!S.cats.some(function (c) { return c.id === S.active; })) S.active = S.cats[0] ? S.cats[0].id : null;
      render();
    }).catch(function () { $('#empty').hidden = false; $('#empty').textContent = 'Gagal memuat data. Coba muat ulang halaman.'; });
  }

  // ---------- render ----------
  function render() {
    renderHeader(); renderTabs(); renderTools(); renderList();
  }
  function renderHeader() {
    $('#modeBadge').hidden = !S.dev;
    $('#userBtn').classList.toggle('on', S.dev);
    $('#userBtn').setAttribute('aria-label', S.dev ? 'Menu akun dev' : 'Masuk mode dev');
    $('#addForm').hidden = !S.dev;
    $('#catTools').hidden = !S.dev;
    if (!S.dev) $('#userMenu').hidden = true;
  }
  function renderTabs() {
    var nav = $('#tabs'); nav.textContent = '';
    S.cats.forEach(function (c) {
      var n = S.tasks.filter(function (t) { return t.cat === c.id && t.status !== 'selesai'; }).length;
      var b = h('button', 'tab', c.name);
      b.type = 'button';
      if (c.id === S.active) b.setAttribute('aria-current', 'true');
      if (n) b.appendChild(h('span', 'n', String(n)));
      b.onclick = function () { S.active = c.id; S.edit = null; render(); };
      nav.appendChild(b);
    });
    if (S.dev) {
      var p = h('button', 'tab plus', '+');
      p.type = 'button'; p.setAttribute('aria-label', 'Tambah kategori');
      p.onclick = function () {
        var name = prompt('Nama kategori baru:');
        if (name && name.trim()) act(api('POST', '/api/categories', { name: name.trim() }).then(function (c) { S.active = c.id; }));
      };
      nav.appendChild(p);
    }
  }
  function renderTools() {
    var cat = S.cats.filter(function (c) { return c.id === S.active; })[0];
    $('#renameCat').onclick = function () {
      if (!cat) return;
      var name = prompt('Nama baru untuk kategori ini:', cat.name);
      if (name && name.trim()) act(api('PATCH', '/api/categories/' + cat.id, { name: name.trim() }));
    };
    $('#deleteCat').onclick = function () {
      if (!cat) return;
      if (confirm('Hapus kategori "' + cat.name + '" beserta semua tugas di dalamnya?')) act(api('DELETE', '/api/categories/' + cat.id));
    };
  }
  function renderList() {
    var ul = $('#list'); ul.textContent = '';
    var items = S.tasks.filter(function (t) { return t.cat === S.active; });
    var c = { belum: 0, proses: 0, selesai: 0 };
    items.forEach(function (t) { c[t.status]++; });
    $('#summary').textContent = items.length ? 'Belum ' + c.belum + ' · Proses ' + c.proses + ' · Selesai ' + c.selesai : '';
    var empty = $('#empty');
    empty.hidden = !!items.length;
    if (!items.length) empty.textContent = S.dev ? 'Belum ada tugas di kategori ini. Tambahkan lewat form di atas.' : 'Belum ada tugas di kategori ini.';
    items.forEach(function (t) { ul.appendChild(row(t)); });
  }
  function row(t) {
    var li = h('li', 'item st-' + t.status);
    var info = h('div');
    if (S.edit === t.id) {
      info.className = 'edit-fields';
      var a = h('input'); a.type = 'text'; a.maxLength = 60; a.value = S.draft.name; a.setAttribute('aria-label', 'Nama');
      a.oninput = function () { S.draft.name = a.value; };
      var b = h('input'); b.type = 'text'; b.maxLength = 300; b.value = S.draft.task; b.setAttribute('aria-label', 'Tugas');
      b.oninput = function () { S.draft.task = b.value; };
      info.appendChild(a); info.appendChild(b);
    } else {
      info.appendChild(h('div', 'who', t.name));
      info.appendChild(h('div', 'what', t.task));
    }
    li.appendChild(info);

    var grp = h('div', 'status'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Status ' + t.name);
    ST.forEach(function (s) {
      var lb = h('label', 'chip s-' + s);
      var cb = h('input'); cb.type = 'checkbox'; cb.checked = t.status === s; cb.disabled = !S.dev;
      cb.onchange = function () {
        if (!S.dev) { cb.checked = t.status === s; return; }
        if (t.status === s) { cb.checked = true; return; }
        act(api('PATCH', '/api/tasks/' + t.id, { status: s }));
      };
      lb.appendChild(cb); lb.appendChild(h('span')).appendChild(h('b', null, LBL[s]));
      grp.appendChild(lb);
    });
    li.appendChild(grp);

    if (S.dev) {
      var ac = h('div', 'acts');
      if (S.edit === t.id) {
        var ok = h('button', 'primary', 'Simpan'); ok.type = 'button';
        ok.onclick = function () {
          var n = S.draft.name.trim(), k = S.draft.task.trim();
          if (!n || !k) { toast('Nama dan tugas tidak boleh kosong'); return; }
          S.edit = null; act(api('PATCH', '/api/tasks/' + t.id, { name: n, task: k }));
        };
        var no = h('button', null, 'Batal'); no.type = 'button';
        no.onclick = function () { S.edit = null; render(); };
        ac.appendChild(ok); ac.appendChild(no);
      } else {
        var ed = h('button', null, 'Edit'); ed.type = 'button';
        ed.onclick = function () { S.edit = t.id; S.draft = { name: t.name, task: t.task }; render(); };
        var del = h('button', 'danger', 'Hapus'); del.type = 'button';
        del.onclick = function () { if (confirm('Hapus tugas ini?')) act(api('DELETE', '/api/tasks/' + t.id)); };
        ac.appendChild(ed); ac.appendChild(del);
      }
      li.appendChild(ac);
    }
    return li;
  }

  // ---------- form tambah ----------
  $('#addForm').onsubmit = function (e) {
    e.preventDefault();
    var n = $('#inName'), k = $('#inTask');
    var nv = n.value.trim(), kv = k.value.trim();
    if (!S.dev || !nv || !kv || !S.active) return;
    act(api('POST', '/api/tasks', { cat: S.active, name: nv, task: kv }).then(function () { n.value = ''; k.value = ''; n.focus(); }));
  };

  // ---------- login / menu akun ----------
  var dlg = $('#loginDlg');
  $('#userBtn').onclick = function (e) {
    e.stopPropagation();
    if (!S.dev) { $('#loginErr').hidden = true; $('#pw').value = ''; dlg.showModal(); $('#pw').focus(); }
    else $('#userMenu').hidden = !$('#userMenu').hidden;
  };
  document.addEventListener('click', function (e) {
    if (!$('#userMenu').contains(e.target)) $('#userMenu').hidden = true;
  });
  $('#loginCancel').onclick = function () { dlg.close(); };
  $('#loginForm').onsubmit = function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('.primary'); btn.disabled = true;
    api('POST', '/api/login', { password: $('#pw').value }).then(function () {
      S.dev = true; $('#pw').value = ''; dlg.close(); render(); toast('Mode dev aktif');
    }).catch(function (err) {
      var el = $('#loginErr'); el.textContent = err.message; el.hidden = false; $('#pw').select();
    }).then(function () { btn.disabled = false; });
  };
  $('#logoutBtn').onclick = function () {
    api('POST', '/api/logout', {}).catch(function () {}).then(function () { S.dev = false; S.edit = null; render(); toast('Keluar dari mode dev'); });
  };

  // ---------- mulai ----------
  api('GET', '/api/me').then(function (d) { S.dev = !!d.dev; }).catch(function () {}).then(load);
  setInterval(function () { if (!S.edit && !document.hidden && !dlg.open) load(); }, 60000);
})();
