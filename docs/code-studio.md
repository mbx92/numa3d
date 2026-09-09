# Code Studio — Code → 3D (beta)

Buka **Tools → Code Studio** (`/tools/code-studio`) setelah perubahan ini dipasang. Fitur ini dibangun di atas perbaikan generator pada PR #19; tidak membutuhkan tabel database, layanan Python, atau dependency baru.

## Cara pakai

1. Pilih **Kode sendiri** untuk kerangka kosong, atau contoh pelat berlubang, wadah terbuka, pola lubang, atau croissant. Memilih item di dropdown mengganti kode editor. Mengetik di editor menandai sesi sebagai kode sendiri.
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
| `roundedBox(w, d, h, radius)` | Balok dengan mesh sudut/tepi bulat. `0 <= radius <= min(w,d,h)/2`; nol sama dengan box. Dimensi total tetap w/d/h. |
| `capsule({ radius, height })` | Kapsul sepanjang Z; height adalah tinggi total termasuk kedua ujung, minimal `2 * radius`. |
| `cylinder({ radius, height, segments })` | Silinder sepanjang Z, berpusat di origin; segments opsional, default 48. |
| `sphere(radius)` | Bola berpusat di origin. |
| `torus({ major, minor, arc, segments, taper, flatten, ridges, ridgeDepth })` | Torus di bidang XY. `arc` 1–360°, default 360. `taper` 0–1 meruncingkan ujung. `flatten` 0.2–1 memipihkan tabung (1 = bundar). `ridges` 0–16 lipatan sepanjang busur; `ridgeDepth` 0–0.45. `minor` harus lebih kecil dari `major`. |
| `circle2d({ radius, segments })` | Profil lingkaran di XY. `segments` 8–96, default 48. Tidak bisa di-`return`. |
| `rect2d(w, d)` | Profil persegi panjang berpusat di origin. |
| `polygon({ sides, radius, inner })` | Poligon beraturan; `sides` 3–24. `inner` 0.05–1 (default 1). Nilai &lt; 1 membuat bintang dengan jari-jari dalam `inner * radius`. Sin/cos dihitung di kernel, bukan di kode pengguna. |
| `offset(p, delta)` | Menggelembungkan (`delta` positif) atau menyusutkan profil; join Round. |
| `translate2d(p, [x,y])` / `rotate2d(p, deg)` / `scale2d(p, s atau [sx,sy])` | Transformasi profil 2D. |
| `union2d` / `subtract2d` / `intersect2d` | Boolean 2D; 2–16 profil. |
| `extrude(p, h)` atau `extrude(p, { height, twist, divisions })` | Prisma sepanjang Z, berpusat di origin. `twist` −360..360 memerlukan `divisions` 4–64. |
| `revolve(p)` atau `revolve(p, { arc, segments })` | Memutar profil XY mengelilingi Y, lalu sumbu hasil menjadi Z. Letakkan profil di X ≥ 0. `arc` 1–360 default 360. |
| `union(a, b, ...)` | Menggabungkan solid; 2–16 argumen. |
| `subtract(a, b, ...)` | Memotong solid pertama dengan solid berikutnya. |
| `intersect(a, b, ...)` | Mengambil volume perpotongan. |
| `hull(a, b, ...)` | Convex hull dari 2–16 solid yang sudah ditransformasi. Menghubungkan bentuk terpisah dan mengisi cekungan/lubang. |
| `smoothUnion(a, b, radius)` | Blend organik dua field dengan radius 0.1–100 mm; batas subset dan resolusi di bawah. |
| `translate(a, [x,y,z])` | Memindahkan bentuk. |
| `rotate(a, [x,y,z])` | Rotasi derajat mengikuti kernel Manifold. |
| `scale(a, [x,y,z])` | Skala positif per sumbu. |
| `repeat(a, count, [dx,dy,dz])` | Menggabungkan 1–32 salinan; salinan pertama pada posisi asal. |
| `param("name", initial, { min, max, step })` | Parameter numerik bernama unik. Opsi default min=1, max=200, step=1. |

Program berisi deklarasi `const` lalu tepat satu `return` solid. Mendukung literal angka/string, array dan object literal untuk opsi, komentar `//`/`/* */`, tanda kurung, serta aritmetika `+ - * /`. Angka harus finite. Parameter di luar rentang ditolak, tidak di-clamp. `step` adalah langkah kontrol input; fungsi yang memerlukan integer tetap memvalidasinya.

Hasil akhir satu solid dengan satu warna, dapat mengandung beberapa bagian terpisah jika hasil union tidak bersentuhan. Hasil digeser bersama ke Z=0. Profil 2D (`circle2d`, `rect2d`, `polygon`, offset/boolean/transform 2D) hanya boleh menjadi argumen `extrude`/`revolve`, bukan nilai `return`. Belum ada teks/font, SVG/mesh import, loop, `Math` pengguna, fungsi buatan pengguna, paket eksternal, script Three.js, atau backend Python. Periksa bagian terpisah, support, ketebalan, dan toleransi di slicer; validitas manifold tidak sama dengan jaminan layak cetak.

## Batas keamanan dan resource

- Source diparse menjadi data dalam `utils/codeStudioLanguage.js`. Hanya node solid/profil yang dibuat interpreter yang dapat digunakan oleh operasi geometri. Tidak ada `eval`, `Function`, user-controlled import, atau penerusan akses global/properti. Sin/cos untuk `polygon` dan torus tetap di kernel terpercaya.
- Kode pengguna tidak memiliki API untuk cookie, DOM, fetch, storage, atau endpoint aplikasi. Ini adalah pembatasan bahasa, **bukan klaim bahwa Web Worker same-origin sendiri merupakan sandbox keamanan**. Worker memuat WASM trusted yang dibundel aplikasi.
- Worker baru untuk setiap run, dihentikan saat selesai/gagal/timeout/batal. Timeout 30 detik berlaku juga selama pemuatan WASM. Browser tanpa Web Worker tidak diberi fallback eksekusi pada main thread/server.
- Batas source 16.000 karakter; 4.000 token; kedalaman 48; 128 node operasi; 16 parameter; repeat 32; anggaran ekspansi 1.024. Dimensi akhir/intermediate maksimal 1.000 mm, koordinat ±10.000 mm, sphere/cylinder radius maksimal 500 mm, segments 8–96.
- Geometri dicek status, bounding box finite, volume akhir positif, maksimal 200.000 triangle per solid dan 1.000.000 triangle native yang dipertahankan dalam satu job. Native solids dibuang dalam `finally`.
- Batas triangle diperiksa **setelah** operasi kernel. Ini tidak memberikan hard memory quota bagi WebAssembly selama boolean berjalan. Desain kompleks masih dapat menghabiskan resource browser; jangan memindahkan interpreter ini menjadi layanan server penerima kode bebas tanpa isolasi OS dan pembatasan resource tambahan.
- Upload galeri dan penulisan recipe menggunakan endpoint admin yang sudah ada. Tidak ada perubahan permission, auth, schema database, atau deployment.

## Verifikasi

`npm test` mencakup parser dan batas input, upaya akses JavaScript/prototype/global, geometri Manifold seluruh contoh, volume analitik boolean/transform, hasil kosong/overflow, struktur STL/3MF, struktur GLB dan warna, lifecycle worker, serta handler worker asli dengan adaptor URL WASM di Node.

Tes tambahan `tests/codeStudioGeometry.test.js` memeriksa volume rounded box, radius nol/maksimal, rasio dimensi ekstrem, convex hull, determinisme dan penambahan volume blend, transform XYZ, batas sampling, health mesh rusak, cache, serta seluruh contoh AI pada default dan batas masing-masing parameter. Tes ekspor lama menjalankan seluruh contoh untuk STL/3MF. GLB juga diuji dengan Three.js exporter.

Repo tidak memiliki script lint/typecheck. Build produksi mengompilasi Vue; pemeriksaan `checkJs` terfokus dapat dijalankan dengan TypeScript yang tersedia pada lingkungan pengembang. Tidak ada dependency runtime baru.

Verifikasi V2: suite Node mencakup round-trip topologi/volume 3MF dan accessor GLB untuk bentuk baru. Playwright/Chromium memeriksa preview kaktus dan croissant pada 1440 x 1000 dan 390 x 844, pixel model nonblank, orbit, overflow horizontal, serta unduhan STL/3MF/GLB tanpa page error. Tes browser menggunakan respons auth/material tiruan pada konteks terisolasi; Worker, WASM, renderer, dan eksportir asli tetap dijalankan. Ini tidak menguji autentikasi nyata atau galeri server.

## Fondasi Geometri V2

Audit menemukan alur berikut, yang dipertahankan:

1. `pages/tools/code-studio.vue`: textarea, parameter, JSON versi 1, revisi hasil, preview/ekspor/HPP.
2. `utils/codeStudioLanguage.js`: tokenizer sticky-regex, recursive-descent interpreter, validasi allowlist dan identitas solid melalui WeakSet. AST ekspresi langsung direduksi menjadi angka dan DAG solid `{ op, args, cost }`; tidak ada JavaScript execution.
3. `utils/codeStudioEngine.js`: evaluator DAG dengan cache identitas node, ownership native per job, batas status/ukuran/triangle. CSG tetap Manifold WASM, bukan Three.js/BVH.
4. `workers/codeStudio.worker.js` dan `utils/codeStudioJob.js`: satu Worker per job, transfer buffer, terminasi pada selesai/error/batal/30 detik. Semua kernel, SDF, health, dan normal berjalan di Worker.
5. `utils/codeStudioGenerator.js`: cache satu hasil geometri per editor, BufferGeometry terindeks dengan normal native, material dan ekspor. Cache tidak menyimpan kegagalan, dihapus saat unmount, dan memberi setiap hasil salinan buffer miliknya sendiri.
6. `components/KeychainPreview.vue`: renderer Three.js bersama, orbit/camera/grid, clone untuk ownership viewer, orientasi Z-up tanpa mengubah mesh ekspor. `utils/keychainExport.js` menyediakan 3MF dan GLB; STL memakai Three.js STLExporter. `utils/geometryPack.js` tetap kompatibel dengan generator lain.

Dependencies yang sudah ada: `manifold-3d@3.5.1`, `three@0.185.1`, `three-bvh-csg@0.0.18`, `three-mesh-bvh@0.9.14` transitif, dan `fflate`. Tidak ada meshoptimizer. Mengganti CSG Manifold yang sudah valid dengan BVH tidak memberi manfaat bagi Code Studio. Hull dan level-set memakai API native yang sudah dibundel. Referensi kernel: [Manifold API](https://manifoldcad.org/docs/html/classmanifold_1_1_manifold.html).

Rounded box adalah convex hull delapan bola terdiscretisasi pada sudut inti balok, ekuivalen Minkowski sum balok inti dan bola faceted. Radius nol memakai cube; radius maksimal mengurangi jumlah pusat unik, sehingga tidak memerlukan balok inti berukuran nol. Capsule memakai hull dua bola. Tessellation bola 48 segmen mempertahankan dimensi total dan membuat geometri melengkung nyata pada mesh ekspor.

## Permukaan Organik

`utils/codeStudioSdf.js` adalah backend field murni tanpa dependency renderer. Ia mengompilasi IR menjadi jarak analitik dengan polynomial smooth-min, kemudian memakai `Manifold.levelSet` (BCC marching tetrahedra) untuk menghasilkan solid native yang bisa dilanjutkan ke CSG/hull/ekspor.

- Input smoothUnion: box, roundedBox, sphere, cylinder, capsule, translate, rotate, **scale seragam**, union, repeat, dan nested smoothUnion.
- Hull, torus termasuk arc/warp, subtract, intersect, extrude, revolve, dan scale tidak seragam **belum boleh berada di dalam** smoothUnion. Validator menolak input ini. Terapkan potongan, hull, torus, extrude/revolve, dan scale tidak seragam setelah hasil smoothUnion bila diperlukan. `smoothSubtract` dan sweep belum tersedia.
- Ini blend field analitik, bukan smooth pada triangle mesh input. `segments` silinder tidak mengubah field; tepi tajam bisa terdiscretisasi berbeda. Blend bukan fillet CAD presisi dan bukan jaminan semua input terpisah akan tersambung. Cabang sebaiknya overlap.
- Edge length ditentukan oleh nilai terkecil antara bentang terpanjang/64 dan fitur terkecil/3, termasuk radius blend. Bounds analitik diperluas dengan margin blend dan dua edge untuk menghindari clipping permukaan.
- Preflight membatasi 192 sampel per sumbu, 500.000 sel estimasi, dan 24 juta unit kerja total. Guard callback membatasi 4 juta sampling dan 24 juta evaluasi node aktual per job. Batas mesh/timeout lama tetap berlaku. Resolusi yang terlalu mahal ditolak, tidak diperbesar diam-diam.
- Angka edge length pada model health adalah resolusi sampling perkiraan, **bukan toleransi dimensi yang dijamin**. Fitur lebih kecil dari grid dapat hilang; tidak ada deteksi ketebalan otomatis. Untuk lubang presisi, lakukan subtract setelah blend.

## Kesehatan Model

`utils/codeStudioHealth.js` menginspeksi buffer Float32 final yang sama dengan preview/ekspor: vertex finite, index valid, triangle degenerate/duplikat, edge terbuka, lebih dari dua face per edge, orientasi edge, dan vertex yang mempertemukan shell terpisah. Exact coordinate welding mengidentifikasi duplikasi properti tanpa menutup celah kecil memakai epsilon. Hasil yang gagal pemeriksaan topologi ditolak.

Shell volume bertanda membedakan rongga internal dari bagian solid terpisah. Bagian terpisah menghasilkan peringatan, tidak dihapus karena bisa disengaja. Normal native diperiksa finite dan panjang valid. Tampilan **Mesh tertutup** berarti pemeriksaan ini lolos, bukan sertifikasi printable: self-intersection, ketebalan, support, toleransi, dan kesesuaian mekanis belum diverifikasi. Tidak ada mesh repair destruktif atau simplification tersembunyi.

## AI Dan Contoh

Audit tidak menemukan endpoint LLM, API key AI, schema tool generation, atau system prompt AI pada aplikasi. `codeStudioGenerator.js` adalah generator mesh lokal. `utils/codeStudioAi.js` kini menyediakan kontrak instruksi provider-neutral dan contoh valid; tombol **Prompt AI** menyalinnya untuk generator eksternal. Tidak ada kode atau data pengguna yang dikirim ke layanan AI oleh aplikasi. Integrasi LLM mendatang harus memakai kontrak ini dan tetap menjalankan parser/validator terhadap responsnya.

Tujuh contoh produk pada `utils/codeStudioExamples.js` dan dropdown editor: enclosure elektronik membulat, handle ergonomis, kaktus dengan cabang smooth, housing plate MX, bracket kamera, enclosure ventilasi dengan repeat, dan pot dengan rongga/drainase. Tiga contoh profil 2D: pelat heksagon (`polygon` + `extrude`), mangkuk putar (`union2d` + `revolve`), dan tatakan bintang (`polygon` bintang + `extrude`). Housing MX memakai bukaan nominal dengan clearance yang dapat diubah; bukan pengganti profil socket/stem terkalibrasi milik generator clicker dan bukan desain mekanisme internal switch.

Contoh croissant memakai badan sabit meruncing dan lima segmen gulungan melintang yang overlap, bukan ridges memanjang pada tabung. `puff` mengatur ketebalan relatif terhadap size agar siluet tetap berisi ketika ukuran berubah. Contoh ini diperiksa tetap satu solid dan memiliki bukaan sabit pada kombinasi parameter ekstrem. Pilih ulang Croissant di dropdown untuk memuat contoh yang diperbarui; source yang sedang diedit atau disimpan tidak ditulis ulang otomatis. Kode DSL mentah memakai spasi dan `*`, bukan entity HTML `&#x20;` atau escape Markdown `\*`.

## Batas Dan Langkah Berikutnya

Node yang dipakai berulang dihitung sekali per job. Nama/warna tidak memicu rebuild kernel untuk source/parameter yang sama. Pembuatan normal sebelumnya dilakukan di main thread dengan triangle soup; sekarang memakai `calculateNormals` di WASM dan transfer indexed buffers. Viewer masih melakukan clone untuk ownership, dan ekspor XML/ZIP/GLB masih di main thread. Worker tetap one-shot untuk pembatalan keras; belum ada cache native lintas Worker. Batas triangle native tetap diperiksa setelah operasi, bukan hard quota memori WASM.

Prioritas selanjutnya: teks/font dan impor SVG, tolok ukur interaktif pada perangkat mobile, worker ekspor untuk mesh besar, lalu signed-distance mesh backend untuk hull/torus/extrude di dalam smoothUnion. Sebelum produksi mekanis, verifikasi hasil di slicer dan lakukan test print. Pengujian MinIO/database, auth nyata, slicing, dan cetak fisik terpisah dari tes geometri ini.
