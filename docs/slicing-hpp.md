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

## Custom Order dari STL / 3MF

Pada menu Custom, unggah satu file STL atau 3MF lalu pilih **Slice dengan Orca**. Pesanan baru hanya dapat disimpan setelah slicing selesai. STL ASCII/binary dan 3MF maksimal 40 MB, ukuran maksimal 260 × 260 × 260 mm. STL dibaca dalam mm; satuan dan transformasi 3MF mengikuti model. Orca menempatkan model di plate tanpa mengubah orientasinya, memakai profil Kobra X nozzle 0,4 mm, PLA, layer 0,16 mm High Quality. 3MF dibangun ulang sebagai proyek Orca bersih: geometri, komponen lokal, warna per bagian/per segitiga, serta painting Orca/Bambu dipertahankan. Profil, G-code, dan post-processing bawaan file diabaikan. Modifier, negative part, tekstur/gradien warna, dan volume Prusa yang belum didukung ditolak dengan pesan; ekspor ulang dari Orca bila diperlukan. File 3MF asli tetap disimpan di pesanan.

Batas 40 MB mengacu pada ukuran berkas yang diunggah. Isi arsip 3MF setelah diekstrak dibatasi 200 MB, dan mesh maksimal 2.684.352 segitiga. File ZIP yang kecil dapat melewati batas tersebut bila mesh sangat rapat; sederhanakan mesh dan ekspor ulang sebelum mengunggah. Model besar dapat memerlukan beberapa gigabita RAM saat dikonversi atau di-slice.

Jika 3MF berisi beberapa plate Orca/Bambu, buka **Plate yang dihitung**, centang satu atau beberapa plate, lalu tekan **Terapkan plate** sebelum memetakan material. Warna aktif adalah gabungan plate terpilih. Setiap plate di-slice terpisah agar prime tower dan durasi dihitung per proses cetak; gram serta waktu dijumlahkan untuk HPP satu unit pesanan. Hasil menyimpan rincian tiap plate dan nomor plate terpilih. Mengganti pilihan menghapus hasil slicing sebelumnya dan memeriksa ulang warna. Plate kosong dapat dilihat tetapi tidak dapat di-slice. Maksimal 16 plate dipilih dalam satu job. File 3MF tanpa metadata plate diperlakukan sebagai satu plate. Tool profil 3MF terpisah masih mensyaratkan satu plate.

STL memakai satu slot filament tanpa prime tower. Warna pada plate 3MF yang dipilih ditampilkan sebelum slicing, lalu setiap warna dipetakan ke filament PLA inventori dalam gram. Warna yang sama dan stok positif dicocokkan otomatis; jika tidak tersedia, pengguna harus memilih pengganti secara eksplisit. Maksimal empat material berbeda sesuai konfigurasi Kobra X; beberapa warna sumber boleh memakai satu material yang sama. Pada setiap plate, slot material yang tidak dipakai dikeluarkan sehingga prime tower hanya dihitung saat plate tersebut memakai beberapa material. Material kosong stok tidak dapat dipilih. Setelah slicing, kebutuhan setiap material dikalikan jumlah pesanan dan dibandingkan stok; penyimpanan ditolak bila kurang. Stok diperiksa ulang secara atomik saat produksi selesai, dikurangi untuk unit jadi dan gagal, serta dikembalikan per material saat hasil produksi dibatalkan. Seluruh objek pada plate 3MF yang dipilih (atau seluruh STL) dianggap satu unit pesanan: gram dan waktu hasil Orca menjadi biaya per unit, jumlah pesanan mengalikan HPP total dan estimasi produksi. Durasi untuk pencatatan produksi dibulatkan ke atas ke menit; statistik detik asli disimpan. Packaging, buffer gagal, tenaga kerja, dan mesin tetap mengikuti isian pesanan serta pengaturan HPP.

`POST /api/slicer/inspect` menerima multipart `file` dan `selectedPlates` JSON opsional, lalu mengembalikan palet warna pada plate terpilih. `POST /api/slicer/jobs` juga menerima `tool=custom-order` dengan `file` STL atau 3MF, `selectedPlates` JSON untuk 3MF, dan `materialIds` JSON berisi pilihan material untuk tiap warna sumber. Pemetaan divalidasi terhadap inventori dan disimpan di `slicer_jobs.input_config`; statistik tidak dapat diedit oleh klien. Pemakaian gram tiap material disimpan di `custom_order_materials`; HPP menghitung harga masing-masing filament, dengan biaya mesin, tenaga kerja, dan packaging sekali per unit. `POST /api/custom-orders` wajib menyertakan `slicerJobId` dari job custom selesai milik pengguna (admin dapat mengakses semua job). Server mengambil gram dan waktu dari job, menyimpan statistik di `custom_orders.slicer_result`, dan menyalin file asli ke penyimpanan pesanan dalam transaksi bersama produksi. Menghapus job antrean tidak menghapus file pesanan. Jalankan migrasi `0038_custom_order_slicing` dan `0039_custom_order_materials` sebelum memakai alur baru; worker yang diperbarui memakai antrean yang sama.

Detail pesanan dapat melakukan slicing ulang dari STL / 3MF baru atau lampiran model yang sudah ada sebelum produksi dimulai. Perubahan data komersial mempertahankan gram/waktu yang tercatat. Pesanan lama tetap dapat dibuka dan diubah tanpa wajib slicing ulang.

## API generator

`POST /api/slicer/jobs`, wajib login, `multipart/form-data`:

- `file`: 3MF yang diekspor langsung dari generator, maksimal 40 MB.
- `tool`: `keychain`, `clicker`, atau `qr-plate`.
- `includeProfile`: `true` atau `false`; mengikuti pilihan Sertakan profil di UI. Jika false, slicing lokal memakai proses standar Kobra X 0,16 mm High Quality dan PLA.
- Respons awal adalah job berstatus `queued`. Klien membaca `GET /api/slicer/jobs/:id` sampai status menjadi `completed`, `failed`, atau `cancelled`.

Hasil `completed.result` memuat `totalGrams`, `printTimeSeconds`, `filamentGrams`, `colors`, `filamentChanges`, `primeTower`, `slicerVersion`, dan `profile`. Total gram memakai angka total dari Orca, karena penjumlahan slot yang masing-masing dibulatkan bisa berbeda 0,01 g. Durasi mesin dihitung sekali untuk seluruh plate. Gram dan menit recipe memakai angka ini, termasuk purge/prime tower.

Server web hanya menyimpan job di PostgreSQL dan file masukan di MinIO. Service `slicer-worker` mengambil job secara atomik, lalu memanggil [CLI slicing OrcaSlicer](https://www.orcaslicer.com/wiki/cli/cli_actions). OrcaSlicer 2.4.2 dan profil Anycubic sudah dibangun ke image worker; tidak perlu instalasi atau bind mount dari host.

Untuk deployment Compose/Coolify, jalankan kedua service dari `docker-compose.yml`: `app` melayani web/API dan menjalankan migrasi, sedangkan `slicer-worker` baru aktif setelah health check `GET /health` aplikasi berhasil. Worker punya health check sendiri (binary Orca + Postgres). Coolify Compose memakai healthcheck di file itu, bukan menu Healthcheck di dashboard. Worker lokal dapat dijalankan terpisah dengan `npm run slicer:worker`; nilai `DATABASE_URL`, MinIO, dan path Orca mengikuti `.env`.

`GET /api/slicer/status` memeriksa heartbeat worker aktif. `GET /api/slicer/jobs` menyediakan daftar antrean, sedangkan `POST /api/slicer/jobs/:id/cancel` dan `POST /api/slicer/jobs/:id/retry` digunakan halaman `/slicer-queue`. Staff hanya melihat job miliknya; admin melihat seluruh antrean dan dapat menghapus job selesai.

Setiap worker memproses satu pekerjaan sekaligus, batas 3 menit per proses plate, maksimal 4 material untuk generator dan Custom Order 3MF; STL satu material. Beberapa replica worker aman karena job diklaim memakai `FOR UPDATE SKIP LOCKED`. Heartbeat mendeteksi worker mati dan mengembalikan job tertinggal ke antrean. Direktori kerja dibuat sementara dan dibersihkan. Worker mengganti pengaturan unggahan dengan profil generator dan hanya menerima struktur mesh/objek generator, atau geometri STL / 3MF yang divalidasi untuk Custom Order; pengaturan post-processing dari unggahan tidak dijalankan. API menghasilkan estimasi; tidak mengirim perintah ke printer.

## Verifikasi

- `node --test tests/custom3mf.test.js tests/customOrderSlicing.test.js tests/customOrderUi.test.js`; set `CUSTOM_ORDER_DB_TEST=1` dan jalankan `tests/customOrderSlicingDb.test.js` untuk uji handler/transaksi database lokal. Semua fixture database dibatalkan.
- Uji OrcaSlicer 2.4.2 pada STL dan 3MF box 20 × 20 × 10 mm: 2,02 g, 577 detik, satu slot filament tanpa prime tower.

- `node --test tests/slicerHpp.test.js tests/slicerProfiles.test.js tests/hpp.test.js`.
- `node --test tests/generatorProduct.test.js`; set `GENERATOR_PRODUCT_DB_TEST=1` untuk uji transaksi pada database lokal yang sudah dimigrasi. Data uji dibatalkan setelah pengujian.
- Slicing nyata ketiga sampel melalui `sliceGenerator3mf` berhasil.
- Uji HTTP dengan handler dan middleware auth asli: request tanpa sesi mendapat 401; request multipart terautentikasi menghasilkan 4,65 g untuk sampel Keychain AB.
- Statistik, pemetaan gram ke recipe, cache profil, validasi input, dan pemisahan waktu mesin diuji. Cetak fisik belum dilakukan.

- Uji OrcaSlicer 2.4.2 pada 3MF dua bagian bertumpuk 10 × 10 × 4 mm: 0,73 g (0,50 + 0,23 g), 261 detik, satu pergantian filament dan prime tower. Pemetaan keduanya ke satu filament: 0,33 g, 177 detik, tanpa pergantian atau tower.
- Uji pemilihan plate pada 3MF dua plate sintetis dari exporter aplikasi dengan CLI OrcaSlicer Windows 2.4.2: Plate 1 (box 20 × 20 × 10 mm) menghasilkan 2,02 g / 577 detik; Plate 2 (box 40 × 40 × 10 mm) menghasilkan 6,88 g / 1.179 detik. Hasil mencatat nomor plate yang dipilih. Ini belum memverifikasi file multi-plate dari pengguna atau cetak fisik.
- Uji multi-select pada proyek yang sama menghasilkan 8,90 g dan 1.756 detik, dengan rincian tiap plate tetap terpisah. Pada contoh dua plate satu warna berbeda, hasil gabungan 2,35 g dan 754 detik; gram material terbagi 2,02 g dan 0,33 g sesuai plate masing-masing.
