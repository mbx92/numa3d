# Numa3D — Sistem Pencatatan Biaya & Pricing 3D Printing

Aplikasi internal untuk UMKM 3D printing: catat pengeluaran, hitung HPP produk otomatis dari recipe, log penjualan dengan margin bersih, dan laporan per produk. Multi-user dengan 2 role (Admin/Staff).

## Stack

- Nuxt 3 (JavaScript, tanpa TypeScript) — frontend + server routes (`server/api/`)
- PostgreSQL + Drizzle ORM (migrasi via `drizzle-kit`, bukan `db push`)
- Tailwind CSS (tema "3D Factory": netral industrial + aksen safety-orange)
- MinIO — penyimpanan file 3D produk; Three.js — preview model di browser

## Setup

```bash
# 1. Pastikan PostgreSQL jalan, lalu buat database
createdb numa3d

# 2. Atur .env
#    DATABASE_URL=postgres://<user>@localhost:5432/numa3d
#    ADMIN_USERNAME=admin
#    ADMIN_PASSWORD=<password login admin awal>
#    SESSION_SECRET=<string acak, mis. `openssl rand -hex 32`>
#    MINIO_ENDPOINT / MINIO_PORT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET
#    (bucket dibuat otomatis saat upload pertama)
#
#    ADMIN_USERNAME/ADMIN_PASSWORD hanya dipakai SEKALI: saat tabel users masih
#    kosong, server/plugins/bootstrap-admin.js otomatis membuat akun admin
#    pertama dari nilai ini (password di-hash). Setelah itu login selalu lewat
#    tabel users — kelola user tambahan di halaman User (khusus admin).

# 2b. Jalankan MinIO (contoh dev lokal; default kredensial minioadmin/minioadmin)
minio server ~/.minio-data --console-address :9001

# 3. Install & siapkan database
npm install
npm run db:migrate   # jalankan migrasi
npm run db:seed      # isi data contoh (opsional)

# 4. Jalankan
npm run dev          # http://localhost:3000
```

Script lain: `npm run db:generate` (buat file migrasi baru setelah mengubah `server/db/schema.js`).

## Struktur

- `server/db/schema.js` — semua tabel (users, materials, machines, expenses, products, product_recipes, packaging, product_packaging, sales, app_settings, product_files, audit_logs)
- `server/db/migrations/` — file migrasi SQL Drizzle
- `server/utils/hpp.js` — rumus HPP; `server/utils/productHpp.js` — loader HPP per produk
- `server/utils/rbac.js` — `requireAdmin(event)`, dipanggil di awal tiap endpoint yang khusus admin
- `server/utils/audit.js` — `logAudit(event, {...})`, dipanggil setelah tiap mutasi berhasil
- `server/utils/rateLimit.js` — rate limit login in-memory (per-IP dan per-IP+username)
- `server/api/` — REST endpoints per entitas
- `pages/` — Dashboard, Material, Mesin, Packaging, Produk & HPP (recipe builder), Pengeluaran, Penjualan, Laporan, Pengaturan, User, Log Aktivitas
- `scripts/seed.js` — data contoh

## Rumus HPP per unit

```
HPP = material (qty × harga/unit)
    + buffer gagal cetak (failure_rate% × biaya material)
    + listrik (jam print × watt/1000 × tarif per kWh)
    + depresiasi mesin (jam print × harga beli ÷ masa depresiasi bln ÷ jam pakai/bln)
    + tenaga kerja (menit ÷ 60 × upah/jam)
    + packaging (qty × harga/unit)
```

Tarif listrik (default Rp 1.445/kWh) dan asumsi jam pakai mesin per bulan (default 100 jam) diatur di halaman **Pengaturan** (tabel `app_settings`).

Harga jual saran = `HPP ÷ (1 − margin%)`, dengan opsi pembulatan ke Rp 500 / Rp 1.000.

Margin bersih penjualan = `(harga jual × (1 − fee marketplace%) − HPP) × qty`.

## Keputusan desain v1

- Semua nilai uang disimpan sebagai integer rupiah; ditampilkan dengan format `Rp 15.000`.
- Pengurangan stok masih manual (tombol "Stok ±" di halaman Material), tidak otomatis dari penjualan.
- Ambang low-stock masih tetap (material < 200 gram/ml, packaging < 10 unit) — konstanta di `server/api/dashboard.get.js`.
- Laporan memakai HPP produk saat ini × unit terjual (bukan snapshot HPP saat transaksi).
- Auth multi-user: tabel `users` (username, password bcrypt, role `admin`/`staff`), session cookie HMAC stateless berisi `{id, role}` (30 hari, httpOnly) — tidak ada session store, jadi ubah role/hapus user tidak langsung mencabut token yang sudah terbit sampai kedaluwarsa. Semua `/api/*` diproteksi `server/middleware/auth.js`; semua halaman diproteksi `middleware/auth.global.js` (redirect ke `/login`).
- RBAC 2 role: **Admin** akses penuh. **Staff** hanya boleh create/edit/delete di Pengeluaran & Penjualan; Material/Mesin/Packaging/Produk (+ file 3D)/Pengaturan/User read-only baginya — ditegakkan di server (`requireAdmin()` di tiap endpoint mutasi) dan disembunyikan/dinonaktifkan di UI (`isAdmin` computed per halaman). Endpoint User (`/api/users/*`) menolak menghapus/mendemote admin terakhir dan menolak hapus akun sendiri.
- File 3D per produk (.stl/.obj/.3mf/.glb/.gltf, maks 100 MB): isi file di MinIO (`server/utils/minio.js`), metadata di tabel `product_files`. Download/preview di-stream lewat `/api/files/:id` agar tetap di belakang auth (browser tidak akses MinIO langsung). Preview Three.js di `components/ModelViewer.vue` (client-only); `.gltf` dengan resource eksternal (bin/tekstur terpisah) tidak didukung preview — pakai `.glb`.
- Audit log: tiap mutasi (tambah/ubah/hapus) di seluruh entitas dicatat ke tabel `audit_logs` (siapa, kapan, aksi, ringkasan) — dilihat admin di halaman **Log Aktivitas** (200 entri terakhir, tanpa paginasi karena skala aplikasi kecil).
- Rate limit login: in-memory, tanpa Redis (cukup untuk single-instance). Maks 5 percobaan gagal per 15 menit per kombinasi IP+username, dan maks 20 per 15 menit per IP (cegah iterasi banyak username dari satu sumber). Reset otomatis setelah window lewat atau saat login berhasil. **Catatan**: karena in-memory, counter ini hilang saat proses dev di-restart, dan pada deployment multi-instance/serverless tiap instance punya counter terpisah (tidak dibagi) — cukup untuk single-instance, butuh store bersama (mis. Redis) kalau nanti di-scale horizontal.
- Search di halaman Material & Produk: filter client-side (nama/supplier, nama/deskripsi) — cukup untuk skala katalog UMKM, tidak butuh full-text search di database.

## Deploy di Coolify (app saja)

Postgres dan MinIO tidak ikut di-compose — pakai server yang sudah ada. Template env: `.env.coolify.example`.

1. Push repo ke Git, lalu di Coolify: **New Resource → Docker Compose** (bukan Nixpacks). File compose: `docker-compose.yml`.
2. Jika PG/MinIO juga di Coolify, sambungkan app ke **jaringan Docker yang sama** supaya hostname service-nya bisa di-resolve.
3. Isi environment (lihat `.env.coolify.example`):

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | password admin pertama (hanya jika tabel users kosong) |
| `MINIO_ENDPOINT` | hostname MinIO dari dalam container app |
| `MINIO_PORT` | biasanya `9000`; HTTPS publik sering `443` |
| `MINIO_USE_SSL` | `true` jika MinIO HTTPS |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | kredensial MinIO |
| `MINIO_BUCKET` | default `numa3d-files` (dibuat otomatis saat upload) |

4. Domain HTTPS dipasang ke service **app** (port 3000). MinIO tidak perlu dipublikasikan — file di-proxy lewat `/api/files`.
5. Deploy. Entry point menjalankan migrasi lalu `node .output/server/index.mjs`.
6. Login dengan `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Setelah itu kelola user di menu User.

PWA: setelah HTTPS aktif, Chrome/Android menampilkan prompt **Pasang Numa3D**. Safari iOS: Share → Add to Home Screen.

## PWA (lokal)

Prompt install hanya muncul di build produksi (`npm run build && npm run preview`) atau di Coolify. `npm run dev` tidak mendaftarkan service worker.
