# Job Desk Tim (versi Netlify, gratis)

public/ = tampilan. netlify/functions/api.mjs = backend (jalan di Netlify, tidak terlihat pengunjung).
Data disimpan di Netlify Blobs. Password dev TIDAK ada di kode; disimpan di Environment variables Netlify.

## Cara pasang
1. Upload folder ini ke repo GitHub (private boleh). Pastikan package.json dan netlify.toml ikut terunggah.
2. Netlify -> Add new site -> Import an existing project -> pilih repo.
   Build command kosongkan; publish directory `public` (sudah diatur di netlify.toml).
3. Site configuration -> Environment variables -> tambah:
   - ADMIN_PASSWORD = password dev kamu (panjang & unik)
   - SESSION_SECRET = teks acak minimal 32 karakter
   Centang "Contains secret values" bila ada.
4. Deploy ulang (Deploys -> Trigger deploy). Buka web, klik ikon orang di kanan atas, masukkan password.

Catatan: jangan pakai drag-and-drop folder biasa tanpa build, karena Functions butuh library @netlify/blobs
yang dipasang saat build. Pakai GitHub atau Netlify CLI (`netlify deploy --prod`).
