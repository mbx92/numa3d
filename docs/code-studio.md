# Code Studio — Code → 3D (beta)

Buka **Tools → Code Studio** (`/tools/code-studio`) setelah perubahan ini dipasang. Fitur ini dibangun di atas perbaikan generator pada PR #19; tidak membutuhkan tabel database, layanan Python, atau dependency baru.

## Cara pakai

1. Pilih contoh pelat berlubang, wadah terbuka, atau pola lubang. Memilih contoh mengganti kode editor.
2. Ubah kode, atau isi kontrol ukuran yang dibuat oleh `param()`.
3. Klik **Generate**, atau Ctrl/Cmd + Enter. Tombol **Batal** menghentikan worker yang sedang berjalan.
4. Putar/zoom preview Three.js, lihat ukuran XYZ, volume, dan jumlah segitiga. Semua ukuran dalam mm; rotasi dalam derajat.
5. Unduh STL, 3MF berwarna untuk plate 260 × 260, atau GLB. Model di luar plate ditolak oleh ekspor 3MF, bukan diperkecil diam-diam. Preview/STL/GLB tidak menjamin model akan muat printer.
6. Admin dapat menyimpan hasil ke Galeri 3D dan menggunakan panel HPP/recipe yang sudah ada. Pilih material untuk menghitung HPP; angka volume bukan pengganti hasil slicing.
7. **Simpan kode** mengunduh JSON lokal berisi kode, nilai parameter, warna, dan nama. **Buka kode** memuat kembali format versi 1 (maksimal 64 KB). Kode tidak otomatis disimpan di browser atau database, dan file model di galeri tidak menyimpan source kode. Simpan kode sebelum meninggalkan halaman jika ingin melanjutkan nanti.

Ekspor dan penyimpanan galeri memperbarui hasil yang kedaluwarsa sebelum memakai model. HPP dinonaktifkan ketika kode/parameter/warna sudah berubah.

## Bahasa yang didukung

Ini **subset sintaks JavaScript untuk pemodelan**, bukan runtime JavaScript umum, Python, atau OpenSCAD. Tidak menerima script Three.js arbitrer.

```js
const width = param("width", 60, { min: 20, max: 180 });
const body = box(width, 30, 8);
const hole = cylinder({ radius: 3, height: 12 });
return subtract(body, hole);
```

| Fungsi | Perilaku |
| --- | --- |
| `box(w, d, h)` | Balok berpusat di origin. |
| `cylinder({ radius, height, segments })` | Silinder sepanjang Z, berpusat di origin; segments opsional, default 48. |
| `sphere(radius)` | Bola berpusat di origin. |
| `union(a, b, ...)` | Menggabungkan solid; 2–16 argumen. |
| `subtract(a, b, ...)` | Memotong solid pertama dengan solid berikutnya. |
| `intersect(a, b, ...)` | Mengambil volume perpotongan. |
| `translate(a, [x,y,z])` | Memindahkan bentuk. |
| `rotate(a, [x,y,z])` | Rotasi derajat mengikuti kernel Manifold. |
| `scale(a, [x,y,z])` | Skala positif per sumbu. |
| `repeat(a, count, [dx,dy,dz])` | Menggabungkan 1–32 salinan; salinan pertama pada posisi asal. |
| `param("name", initial, { min, max, step })` | Parameter numerik bernama unik. Opsi default min=1, max=200, step=1. |

Program berisi deklarasi `const` lalu tepat satu `return` solid. Mendukung literal angka/string, array dan object literal untuk opsi, komentar `//`/`/* */`, tanda kurung, serta aritmetika `+ - * /`. Angka harus finite. Parameter di luar rentang ditolak, tidak di-clamp. `step` adalah langkah kontrol input; fungsi yang memerlukan integer tetap memvalidasinya.

Hasil akhir satu solid dengan satu warna, dapat mengandung beberapa bagian terpisah jika hasil union tidak bersentuhan. Hasil digeser bersama ke Z=0. Belum ada teks/font, SVG/mesh import, extrude/revolve, multi-material per bagian, loop, fungsi buatan pengguna, paket eksternal, atau backend Python. Periksa bagian terpisah, support, ketebalan, dan toleransi di slicer; validitas manifold tidak sama dengan jaminan layak cetak.

## Batas keamanan dan resource

- Source diparse menjadi data dalam `utils/codeStudioLanguage.js`. Hanya node solid yang dibuat interpreter yang dapat digunakan oleh operasi geometri. Tidak ada `eval`, `Function`, user-controlled import, atau penerusan akses global/properti.
- Kode pengguna tidak memiliki API untuk cookie, DOM, fetch, storage, atau endpoint aplikasi. Ini adalah pembatasan bahasa, **bukan klaim bahwa Web Worker same-origin sendiri merupakan sandbox keamanan**. Worker memuat WASM trusted yang dibundel aplikasi.
- Worker baru untuk setiap run, dihentikan saat selesai/gagal/timeout/batal. Timeout 30 detik berlaku juga selama pemuatan WASM. Browser tanpa Web Worker tidak diberi fallback eksekusi pada main thread/server.
- Batas source 16.000 karakter; 4.000 token; kedalaman 48; 128 node operasi; 16 parameter; repeat 32; anggaran ekspansi 1.024. Dimensi akhir/intermediate maksimal 1.000 mm, koordinat ±10.000 mm, sphere/cylinder radius maksimal 500 mm, segments 8–96.
- Geometri dicek status, bounding box finite, volume akhir positif, maksimal 200.000 triangle per solid dan 1.000.000 triangle native yang dipertahankan dalam satu job. Native solids dibuang dalam `finally`.
- Batas triangle diperiksa **setelah** operasi kernel. Ini tidak memberikan hard memory quota bagi WebAssembly selama boolean berjalan. Desain kompleks masih dapat menghabiskan resource browser; jangan memindahkan interpreter ini menjadi layanan server penerima kode bebas tanpa isolasi OS dan pembatasan resource tambahan.
- Upload galeri dan penulisan recipe menggunakan endpoint admin yang sudah ada. Tidak ada perubahan permission, auth, schema database, atau deployment.

## Verifikasi

`npm test` mencakup parser dan batas input, upaya akses JavaScript/prototype/global, geometri Manifold seluruh contoh, volume analitik boolean/transform, hasil kosong/overflow, struktur STL/3MF, struktur GLB dan warna, lifecycle worker, serta handler worker asli dengan adaptor URL WASM di Node.

Build produksi juga diuji. Lingkungan Work saat ini membutuhkan adapter CPU lokal karena `os.cpus()` kosong, sama seperti PR #19; adapter tidak masuk repository.

Belum dilakukan pengujian browser interaktif, upload MinIO/database, impor OrcaSlicer, atau cetak fisik. Sebelum merge/deploy, uji login staff/admin, ketiga contoh, perubahan parameter saat generate, Batal, navigasi keluar, semua format, round-trip file kode, galeri, dan HPP di staging.
