// Halaman sudah disusun SERVER (lihat netlify/functions/page.mjs).
// File ini hanya menangani interaksi: klik tab, ubah status, tambah/edit/hapus, login.
// Setelah data berubah, JS meminta potongan HTML baru dari server (?frag=1) lalu menempelkannya.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var dlg = $('#loginDlg');
  var editing = false;

  function app() { return $('#app'); }
  function active() { return app().dataset.active || ''; }
  function isDev() { return app().dataset.dev === '1'; }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------- ambil HTML baru dari server ----------
  function refresh(k) {
    var key = k || active();
    return fetch('/?frag=1&k=' + encodeURIComponent(key), { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } })
      .then(function (r) { if (!r.ok) throw new Error('Gagal memuat data'); return r.text(); })
      .then(function (html) {
        editing = false;
        app().outerHTML = html;
      })
      .catch(function (e) { toast(e.message || 'Gagal memuat data. Coba muat ulang halaman.'); });
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
          if (r.status === 401 && url !== '/api/login') refresh();
          throw new Error(d.error || 'Terjadi kesalahan');
        }
        return d;
      });
    });
  }
  function act(p, k) {
    return p.then(function () { return refresh(k); }).catch(function (e) { toast(e.message); });
  }

  // ---------- klik (delegasi) ----------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var menu = $('#userMenu');
    if (menu && !menu.contains(t) && !t.closest('#userBtn')) menu.hidden = true;

    var tab = t.closest('a.tab[data-k]');
    if (tab) {
      e.preventDefault();
      history.replaceState(null, '', '/?k=' + tab.dataset.k);
      refresh(tab.dataset.k);
      return;
    }
    if (t.closest('#userBtn')) {
      e.stopPropagation();
      if (!isDev()) { $('#loginErr').hidden = true; $('#pw').value = ''; dlg.showModal(); $('#pw').focus(); }
      else if (menu) menu.hidden = !menu.hidden;
      return;
    }
    if (t.closest('#logoutBtn')) {
      api('POST', '/api/logout', {}).catch(function () {}).then(function () { return refresh(); }).then(function () { toast('Keluar dari mode dev'); });
      return;
    }
    var b = t.closest('button[data-act]');
    if (!b) return;
    var a = b.dataset.act;
    if (a === 'addcat') {
      var name = prompt('Nama kategori baru:');
      if (name && name.trim()) api('POST', '/api/categories', { name: name.trim() }).then(function (c) {
        history.replaceState(null, '', '/?k=' + c.id); return refresh(c.id);
      }).catch(function (er) { toast(er.message); });
    } else if (a === 'rename') {
      var nn = prompt('Nama baru untuk kategori ini:', app().dataset.catname);
      if (nn && nn.trim()) act(api('PATCH', '/api/categories/' + active(), { name: nn.trim() }));
    } else if (a === 'delcat') {
      if (confirm('Hapus kategori "' + app().dataset.catname + '" beserta semua tugas di dalamnya?')) {
        api('DELETE', '/api/categories/' + active()).then(function () {
          history.replaceState(null, '', '/'); return refresh('');
        }).catch(function (er) { toast(er.message); });
      }
    } else {
      var li = b.closest('li.item');
      if (!li) return;
      var id = li.dataset.id;
      if (a === 'del') { if (confirm('Hapus tugas ini?')) act(api('DELETE', '/api/tasks/' + id)); }
      else if (a === 'edit') startEdit(li);
      else if (a === 'cancel') refresh();
      else if (a === 'save') {
        var n = li.querySelector('input[data-f=name]').value.trim(), k = li.querySelector('input[data-f=task]').value.trim();
        if (!n || !k) { toast('Nama dan tugas tidak boleh kosong'); return; }
        act(api('PATCH', '/api/tasks/' + id, { name: n, task: k }));
      }
    }
  });

  function startEdit(li) {
    editing = true;
    var who = li.querySelector('.who').textContent, what = li.querySelector('.what').textContent;
    var info = li.querySelector('.info'); info.textContent = ''; info.className = 'info edit-fields';
    var a = document.createElement('input'); a.type = 'text'; a.maxLength = 60; a.value = who; a.dataset.f = 'name'; a.setAttribute('aria-label', 'Nama');
    var b = document.createElement('input'); b.type = 'text'; b.maxLength = 300; b.value = what; b.dataset.f = 'task'; b.setAttribute('aria-label', 'Tugas');
    info.appendChild(a); info.appendChild(b);
    var ac = li.querySelector('.acts'); ac.textContent = '';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'primary'; ok.dataset.act = 'save'; ok.textContent = 'Simpan';
    var no = document.createElement('button'); no.type = 'button'; no.dataset.act = 'cancel'; no.textContent = 'Batal';
    ac.appendChild(ok); ac.appendChild(no);
    a.focus();
  }

  // ---------- ubah status ----------
  document.addEventListener('change', function (e) {
    var cb = e.target;
    if (!cb.matches || !cb.matches('input[data-status]')) return;
    if (!isDev()) return;
    if (!cb.checked) { cb.checked = true; return; }
    act(api('PATCH', '/api/tasks/' + cb.dataset.id, { status: cb.dataset.status }));
  });

  // ---------- form tambah ----------
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'addForm') return;
    e.preventDefault();
    var n = $('#inName'), k = $('#inTask');
    var nv = n.value.trim(), kv = k.value.trim();
    if (!isDev() || !nv || !kv || !active()) return;
    act(api('POST', '/api/tasks', { cat: active(), name: nv, task: kv }).then(function () { n.value = ''; k.value = ''; }))
      .then(function () { var i = $('#inName'); if (i) i.focus(); });
  });

  // ---------- login ----------
  $('#loginCancel').onclick = function () { dlg.close(); };
  $('#loginForm').onsubmit = function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('.primary'); btn.disabled = true;
    api('POST', '/api/login', { password: $('#pw').value }).then(function () {
      $('#pw').value = ''; dlg.close();
      return refresh().then(function () { toast('Mode dev aktif'); });
    }).catch(function (err) {
      var el = $('#loginErr'); el.textContent = err.message; el.hidden = false; $('#pw').select();
    }).then(function () { btn.disabled = false; });
  };

  // ---------- segarkan otomatis tiap 60 detik ----------
  setInterval(function () {
    var f = document.activeElement;
    var typing = f && f.tagName === 'INPUT' && f.type === 'text' && app().contains(f);
    if (!editing && !typing && !document.hidden && !dlg.open) refresh();
  }, 60000);
})();
