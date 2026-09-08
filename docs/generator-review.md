# Review proses Numa3D dan perbaikan generator

Baseline: `main` pada commit `ddbc3ec11f1cb0f8472002bb077d5feada025594`.

## Cakupan pemeriksaan

Pemeriksaan ini memetakan alur utama aplikasi melalui source code, dengan implementasi dan tes difokuskan pada generator. Ini bukan klaim bahwa seluruh endpoint atau proses produksi telah diuji end-to-end. Database, MinIO, browser interaktif, OrcaSlicer, dan printer fisik tidak dijalankan dalam verifikasi ini.

| Alur | Source utama yang diperiksa | Hasil / batas pemeriksaan |
| --- | --- | --- |
| Login, session, hak akses | `server/middleware/auth.js`, `server/utils/session.js`, `server/api/auth/login.post.js` | Auth cookie, pembatasan login, dan helper admin tersedia; revokasi session perlu penguatan. |
| Material dan pembelian | `server/api/purchases/index.post.js`, `server/utils/productionStock.js` | Pembelian memperbarui stok/harga dalam transaksi; kebijakan stok dan hak akses perlu pengujian staging. |
| Produk, recipe, HPP | `server/api/products/[id]/recipe.put.js`, `utils/hpp.js`, `utils/meshHppEstimate.js` | Tes rumus dan merge recipe lulus; panel generator kini mencegah penulisan dari model kedaluwarsa. |
| Produksi dan pembatalan | `server/api/productions/[id].put.js`, `server/api/productions/[id].delete.js`, `server/utils/productionStock.js` | Ada transaksi serta apply/reverse stok; concurrency antar perubahan status belum diuji. |
| Penjualan dan laporan | `server/api/sales/index.post.js`, `server/utils/saleHpp.js`, `server/api/reports/` | Penjualan menyimpan snapshot HPP dan mengurangi stok produk; tes fallback snapshot lulus. |
| Generator | `pages/tools/`, `utils/*Generator.js`, `workers/` | Worker, freshness hasil, ekspor, lifecycle halaman, dan retry font diperbaiki. |
| Galeri dan font | `server/api/library-files/index.post.js`, `server/utils/fonts.js` | Ekspor galeri kini mengikuti format pilihan; persistensi font produksi dan rollback storage masih perlu tindak lanjut. |
| Build dan deploy | `nuxt.config.js`, `Dockerfile`, `docker-compose.yml`, `scripts/docker-entrypoint.sh` | Build produksi lulus dengan penyesuaian lingkungan uji; migrasi/deploy tidak dijalankan. |

## Perbaikan yang diterapkan

1. **Worker tidak lagi menggantung tanpa penyelesaian Promise.** Client bersama menangani `error`, `messageerror`, kegagalan `postMessage`, timeout inisialisasi 30 detik, dan timeout request 120 detik. Kegagalan infrastruktur menghentikan worker, membersihkan listener/timer, menolak request terkait, dan memungkinkan instance baru pada percobaan berikutnya. Inisialisasi Manifold membatalkan fetch aset saat gagal/timeout.
2. **Fallback Manifold lebih terarah.** Kesalahan input/geometri tidak lagi mematikan Manifold untuk seluruh sesi atau diam-diam beralih engine. Fallback ke Clipper hanya untuk kegagalan infrastruktur dan mode yang tidak mewajibkan Manifold. Mesh, flexi, dan snap-fit tetap memerlukan Manifold. Pesan mode mesh dikoreksi.
3. **Ekspor menggunakan hasil terbaru.** Empat halaman generator berbagi pelacakan revisi form, termasuk perubahan warna bertingkat dan penggantian ArrayBuffer mesh. Download per bagian, plate 3MF, dan penyimpanan galeri menunggu/memperbarui hasil. Request dengan revisi yang sama berbagi pekerjaan aktif. Perubahan selama generate tidak ditandai sebagai hasil segar.
4. **Lifecycle halaman dibersihkan.** Hasil sebelumnya dikosongkan sebelum geometri dibuang. Unmount dan reset wizard menginvalidasi token sehingga hasil terlambat dibuang, bukan dipasang kembali ke halaman yang sudah ditinggalkan.
5. **Format unduhan dan galeri disatukan.** Keychain/lightbox tidak lagi selalu menyimpan STL ketika pengguna memilih 3MF/GLB. Semua halaman menggunakan resolver format yang sama, snapshot model yang sama untuk setiap batch galeri, MIME dari blob, dan timeout upload. Nama berkas lid clicker menggunakan suffix `lid`, bukan `text`.
6. **HPP tidak memakai hasil lama.** Estimasi dari model kedaluwarsa dinonaktifkan, termasuk baris switch. Penulisan recipe menangkap produk tujuan dan hasil estimasi sebelum request async, serta menolak jika model berubah selama pembacaan produk.
7. **Cache font bisa pulih.** Promise fetch/parse font yang gagal dikeluarkan dari cache pada keychain, clicker, dan lightbox sehingga kegagalan sementara dapat dicoba lagi.
8. **Perintah tes standar.** `npm test` menjalankan seluruh tes, tanpa layanan eksternal.

## Verifikasi

- 34 tes lulus: 14 tes sebelumnya dan 20 tes baru.
- Worker diuji dengan fake worker: pemetaan request concurrent, kegagalan runtime/deserialisasi/clone, timeout, inisialisasi, dan retry.
- Freshness diuji melalui Vue effect scope: perubahan nested, penggantian mesh, perubahan saat generate, kegagalan refresh, disposal, dan reset wizard.
- Integrasi memakai font bundled dan mesin geometri asli untuk keychain, clicker, serta lightbox: retry HTTP 503, struktur triangle STL, arsip 3MF per bagian, dan plate 3MF.
- Tes Manifold yang sudah ada tetap memeriksa profil socket/stem MX, snap-fit, dan flexi pada preview/STL.
- Pemetaan lima format ekspor diuji untuk semua tipe bagian; GLB dipetakan menggunakan stub, belum diverifikasi dengan browser/slicer.
- `npm run build` berhasil. Sandbox ini mengembalikan `os.cpus() = []`, sehingga Workbox/Terser awalnya tidak membuat worker. Build diulang dengan adapter CPU lokal dan direktori temporary yang writable; adapter tidak masuk source aplikasi dan konfigurasi produksi tidak diubah.
- `git diff --check` lulus.

## Temuan lanjutan yang belum diubah

| Prioritas | Temuan berbasis source | Langkah verifikasi/perbaikan berikutnya |
| --- | --- | --- |
| Tinggi | Session memuat role selama 30 hari; menghapus/mendemote user tidak mencabut token. Konfigurasi memiliki fallback secret development. | Tolak secret development saat production; validasi status/versi session pengguna. Uji token lama sesudah demotion/deletion di staging. |
| Tinggi | Font Downloader menulis ke `process.cwd()/public/fonts`, sementara Docker runner menyalin aset ke `.output/public`; compose tidak memberi volume untuk font unduhan. | Tetapkan direktori font persisten dan route penyajian runtime; uji unduh font, generate, restart, lalu redeploy. |
| Tinggi | Update/delete produksi membaca status stok sebelum perubahan tanpa row lock eksplisit. Transaksi saja belum menjamin satu transisi saat request bersamaan. | Uji dua transisi simultan pada database staging; tambahkan locking/idempotensi jika terkonfirmasi. |
| Sedang | Upload galeri menulis objek MinIO sebelum insert database. Upload beberapa bagian masih berupa request terpisah. | Tambahkan kompensasi objek saat database gagal dan batch/idempotency key untuk mencegah bagian parsial/duplikat saat retry. |
| Sedang | Beberapa endpoint menerima angka melalui coercion `Number(...)`; validasi range/finite belum seragam. | Uji input negatif/nonfinite dan konsistensi hak akses pada pembelian, recipe, penjualan, dan produksi. |
| Sedang | README lama tidak sepenuhnya mengikuti implementasi: port compose 3017, pengurangan stok produksi/penjualan otomatis, serta MinIO kini menerima URL penuh. | Sinkronkan dokumentasi operasional setelah kebijakan deployment dan stok dikonfirmasi. |

## Smoke test sebelum merge/deploy

1. Jalankan `npm ci`, `npm test`, dan `npm run build` pada Node 22 yang mutakhir (sesuai Docker).
2. Di browser, generate keempat tool; ubah ukuran/warna/sumber mesh, lalu langsung download per bagian dan plate. Pastikan file mengikuti pengaturan terakhir.
3. Simulasikan kegagalan font/aset/WASM melalui DevTools, lalu pulihkan koneksi dan Generate ulang. Navigasi keluar saat generate berjalan dan buka kembali tool.
4. Simpan tiap format ke galeri staging; pastikan ekstensi, MIME, jumlah bagian, dan preview sesuai. Uji respons upload gagal/timeout.
5. Impor 3MF ke OrcaSlicer, periksa orientasi, satuan mm, plate, material, dan geometri mesh impor. Lakukan test print untuk toleransi mekanis sebelum produksi.
