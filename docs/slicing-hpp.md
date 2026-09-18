# Slicing lokal untuk data produksi

Angka di panel Numa3D dan di jendela OrcaSlicer sering berbeda jika 3MF dibuka lalu di-slice dengan proses, filament, atau matriks flush milik akun desktop. **Slice gram & waktu** memakai CLI + profil Numa3D yang tertanam di 3MF (QR Plate: layer 0,12 mm, 2 dinding, infill 15%, proses dasar Kobra X 0,16 mm High Quality, prime tower menyala untuk multiwarna, flush bawaan 70 mm³). Folder data CLI kosong — kalibrasi filament dan flush di `~/Library/Application Support/OrcaSlicer` tidak ikut. Setelah perubahan ini, File → Open 3MF memakai proses yang sama; sisa selisih biasanya dari filament/flush desktop.

## Hasil uji lokal — 15 September 2026

Sampel dibuat dari generator dengan profil PLA Kobra X nozzle 0,4 mm. Ini bukan model yang sedang terbuka di browser pengguna.

| Sampel | PLA menurut Orca | Estimasi waktu | HPP / plate |
| --- | ---: | ---: | ---: |
| Keychain teks AB | 4,65 g | 26 menit 34 detik | Rp4.355 |
| Clicker teks AB | 21,39 g | 80 menit 41 detik | Rp9.318 |
| QR Plate tanpa alas | 13,07 g | 49 menit 21 detik | Rp6.732 |

OrcaSlicer 2.4.2 berhasil menghasilkan G-code ketiganya. Pengujian menggunakan textured plate, susunan/orientasi dari generator, dan prime tower aktif untuk multicolor (diverifikasi dari bagian `TYPE:Prime tower` di G-code). Angka gram dan durasi merupakan estimasi slicer, belum pengukuran cetak fisik. HPP mencakup satu plate lengkap; jangan menganggap seluruh plate clicker sebagai satu clicker individual.

Asumsi biaya, sesuai permintaan pengguna untuk memakai perkiraan:

| Komponen | Nilai |
| --- | ---: |
| PLA | Rp200.000/kg |
| Daya rata-rata mesin | 150 W |
| Harga mesin | Rp5.000.000 |
| Depresiasi | 36 bulan, pemakaian 100 jam/bulan |
| Tarif listrik | Rp1.445/kWh |
| Buffer gagal | 5% biaya PLA |
| Tenaga kerja | 5 menit/plate × Rp20.000/jam |
| Kemasan | Rp1.000/plate |
| Switch/komponen tambahan | Rp0; isi sendiri sesuai jumlah komponen |

HPP Clicker pada sampel di atas belum memasukkan pembelian switch. Tidak ada harga perkiraan yang ditulis ke database material atau mesin. Panel saat ini menghitung HPP memakai harga material katalog dan mesin yang dipilih.

## Simpan model custom sebagai produk baru

Pada QR Plate, Keychain, dan Clicker, pilih material di panel Warna, lakukan **Slice gram & waktu**, isi nama produk, lalu **Simpan sebagai produk baru**. Setiap penyimpanan model membuat produk berstatus draft, dengan file 3MF yang sama seperti yang dikirim untuk slicing, recipe gram material, dan waktu cetak hasil Orca. Waktu dan mesin hanya dicatat sekali untuk seluruh plate. Produk dibuat saat tombol simpan ditekan; Generate atau unduh saja tidak menambah produk.

Panel estimasi volume lama dan pilihan memperbarui recipe produk lama sudah dihapus dari ketiga generator utama. Model atau profil yang berubah perlu di-slice ulang. Semua warna hasil slice harus dipetakan ke material sebelum produk dapat disimpan. HPP dihitung dari recipe dan harga katalog; biaya tenaga kerja dan kemasan dapat diatur di produk.

`POST /api/products/from-generator` khusus admin menerima multipart `file` (3MF maksimal 40 MB) dan `product` (JSON: `requestId` UUID, `name`, `tool`, `materials` berisi `materialId`/`quantityUsed`, `printTimeSeconds`, serta `machineId` opsional). Produk, recipe, metadata file, dan audit disimpan dalam satu transaksi. Upload gagal membatalkan produk baru; percobaan ulang dengan requestId yang sama mengembalikan produk yang sudah tersimpan.

## API

`POST /api/slicer/jobs`, wajib login, `multipart/form-data`:

- `file`: 3MF yang diekspor langsung dari generator, maksimal 40 MB.
- `tool`: `keychain`, `clicker`, atau `qr-plate`.
- `includeProfile`: `true` atau `false`; mengikuti pilihan Sertakan profil di UI. Jika false, slicing lokal memakai proses standar Kobra X 0,16 mm High Quality dan PLA.
- Respons awal adalah job berstatus `queued`. Klien membaca `GET /api/slicer/jobs/:id` sampai status menjadi `completed`, `failed`, atau `cancelled`.

Hasil `completed.result` memuat `totalGrams`, `printTimeSeconds`, `filamentGrams`, `colors`, `filamentChanges`, `primeTower`, `slicerVersion`, dan `profile`. Total gram memakai angka total dari Orca, karena penjumlahan slot yang masing-masing dibulatkan bisa berbeda 0,01 g. Durasi mesin dihitung sekali untuk seluruh plate. Gram dan menit recipe memakai angka ini, termasuk purge/prime tower.

Server web hanya menyimpan job di PostgreSQL dan file masukan di MinIO. Service `slicer-worker` mengambil job secara atomik, lalu memanggil [CLI slicing OrcaSlicer](https://www.orcaslicer.com/wiki/cli/cli_actions). OrcaSlicer 2.4.2 dan profil Anycubic sudah dibangun ke image worker; tidak perlu instalasi atau bind mount dari host.

Untuk deployment Compose/Coolify, jalankan kedua service dari `docker-compose.yml`: `app` melayani web/API dan menjalankan migrasi, sedangkan `slicer-worker` baru aktif setelah health check aplikasi berhasil. Worker lokal dapat dijalankan terpisah dengan `npm run slicer:worker`; nilai `DATABASE_URL`, MinIO, dan path Orca mengikuti `.env`.

`GET /api/slicer/status` memeriksa heartbeat worker aktif. `GET /api/slicer/jobs` menyediakan daftar antrean, sedangkan `POST /api/slicer/jobs/:id/cancel` dan `POST /api/slicer/jobs/:id/retry` digunakan halaman `/slicer-queue`. Staff hanya melihat job miliknya; admin melihat seluruh antrean dan dapat menghapus job selesai.

Setiap worker memproses satu pekerjaan sekaligus, batas 3 menit, maksimal 4 warna untuk konfigurasi awal. Beberapa replica worker aman karena job diklaim memakai `FOR UPDATE SKIP LOCKED`. Heartbeat mendeteksi worker mati dan mengembalikan job tertinggal ke antrean. Direktori kerja dibuat sementara dan dibersihkan. Worker mengganti pengaturan unggahan dengan profil generator dan hanya menerima struktur mesh/objek generator; pengaturan post-processing dari unggahan tidak dijalankan. API menghasilkan estimasi; tidak mengirim perintah ke printer.

## Verifikasi

- `node --test tests/slicerHpp.test.js tests/slicerProfiles.test.js tests/hpp.test.js`.
- `node --test tests/generatorProduct.test.js`; set `GENERATOR_PRODUCT_DB_TEST=1` untuk uji transaksi pada database lokal yang sudah dimigrasi. Data uji dibatalkan setelah pengujian.
- Slicing nyata ketiga sampel melalui `sliceGenerator3mf` berhasil.
- Uji HTTP dengan handler dan middleware auth asli: request tanpa sesi mendapat 401; request multipart terautentikasi menghasilkan 4,65 g untuk sampel Keychain AB.
- Statistik, pemetaan gram ke recipe, cache profil, validasi input, dan pemisahan waktu mesin diuji. Cetak fisik belum dilakukan.
