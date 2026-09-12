# QR Plate Generator

Buka **Tools → QR Plate Generator** (`/tools/qr-plate`). Model mengikuti bentuk umum foto referensi: bingkai berwarna, panel QR terang, ikon di bawah QR, dan alas meja terpisah. Geometri dibuat dengan Manifold di Web Worker; ekspor `.scad` merupakan model OpenSCAD mandiri, bukan runtime untuk menjalankan file SCAD pengguna.

## Penggunaan

1. Pilih **Satu QR** (tautan, teks, atau Wi-Fi) atau **Wi-Fi + WhatsApp**.
2. Untuk dua QR: isi SSID/sandi Wi-Fi, lalu unggah JPEG kartu QR dari WhatsApp. Generator membaca payload di perangkat dan mencetak ulang QR yang rapi (tanpa logo di tengah).
3. Pilih preset dudukan meja, pelat datar, gantungan, atau dinding. Pilih permukaan timbul atau inlay rata.
4. Untuk meja, pilih **Slot miring**, **Tiang lurus**, atau **Tiang berlekuk**. Atur ukuran alas, tinggi tiang/kemiringan, dan kelonggaran slot total. Nilai lebar `0` menghitung ukuran otomatis.
5. Untuk satu QR, pilih ikon Wi-Fi, WhatsApp, website, pembayaran, telepon, lokasi, sosial/suka, tautan, atau tanpa ikon. Mode dua QR memasang ikon Wi-Fi dan WhatsApp otomatis. Opsional: isi **nama usaha** dan unggah **logo SVG** agar muncul di bagian atas pelat (di atas QR). Logo garis tipis bisa diperjelas lewat **Tebal garis logo** (bawaan 0,5 mm). Tambahkan tulisan bawah, atur **Tebal tulisan bawah** jika huruf terlalu tipis, lalu pilih warna bingkai/alas, panel, QR, serta ikon/tulisan.
6. Generate, periksa tampilan **Terpasang** dan **Posisi cetak**, lalu uji tujuan QR lewat **Uji pindai QR** sebelum mencetak.

Pelat memiliki bagian kosong 12 mm di bawah dekorasi untuk masuk ke slot. Pelat dicetak datar, alas dicetak terpisah, lalu dirakit. Kelonggaran bawaan 0,35 mm adalah selisih total lebar slot terhadap ketebalan pelat, bukan per sisi; perlu disesuaikan dengan printer dan bahan. Geometri dan kecocokan digital diperiksa, tetapi belum dilakukan uji cetak fisik, kekuatan, atau kestabilan untuk setiap kombinasi dimensi.

## Format

- **3MF:** warna pelat dipertahankan sebagai multipart; alas menjadi objek terpisah dan ditata pada plate 260 × 260 mm. Kombinasi ukuran yang tidak muat menghasilkan pesan kesalahan.
- **STL ZIP:** bingkai, panel terang, pola QR, ikon/tulisan bila digunakan, serta alas bila digunakan. Impor seluruh warna pelat sebagai satu objek multipart dengan posisi relatif tetap. Alas diimpor terpisah. Petunjuk juga ada dalam ZIP.
- **GLB:** model berwarna dalam posisi terpasang.
- **OpenSCAD:** QR dan kontur ikon/font disematkan tanpa pustaka tambahan. Ukuran pelat, inlay, lubang, jenis alas, slot, dan susunan dapat diedit. `part` mengekspor bagian tertentu pada koordinat asalnya. Isi QR, jenis ikon, dan tulisan diganti melalui generator lalu diekspor ulang.
- **SVG:** QR saja, termasuk ruang kosong untuk pemindaian.

Konten QR dan kata sandi Wi-Fi diproses lokal. Font diambil dari pustaka font aplikasi jika tulisan digunakan. Menyimpan ke galeri adalah tindakan terpisah melalui tombol admin.

## Batas dan verifikasi

Semua keluaran memakai matriks QR yang sama dengan preview. Mode dua QR memakai dua matriks (Wi-Fi dan WhatsApp). Model 3D memberi potongan sudut 0,01 mm pada baris modul untuk menghindari sambungan diagonal yang dapat dianggap non-manifold oleh slicer. Quiet zone empat modul tidak ditempati bingkai, ikon, tulisan, atau lubang. Modul di bawah 0,6 mm ditolak, di bawah 0,8 mm diberi catatan. Pemilihan warna mensyaratkan panel lebih terang dan rasio kontras minimal 4,5 sebagai batas konservatif aplikasi; ini bukan jaminan pemindaian hasil cetak. Inlay menyisakan lantai minimal 0,8 mm.

`tests/qrPlate.test.js` memeriksa payload, validasi, decoding raster dari segitiga permukaan QR sebenarnya, semua ikon, pelat tersambung, warna tidak tumpang tindih, tiga alas beserta variasi ketebalan/kelonggaran, kecocokan slot dalam posisi terpasang, posisi cetak, isi ekspor 3MF/STL/SCAD, serta pelat Wi-Fi + WhatsApp. Font dan WASM asli digunakan. `tests/qrFromImage.test.js` memeriksa pembacaan payload dari gambar QR, termasuk kartu berlatar hijau.

Referensi teknis: [node-qrcode](https://github.com/soldair/node-qrcode), [quiet zone QR dari Denso Wave](https://www.qrcode.com/en/howto/code.html), [format Wi-Fi ZXing](https://github.com/zxing/zxing/wiki/Barcode-Contents), [dokumentasi OpenSCAD](https://openscad.org/documentation.html). Halaman MakerWorld yang diberikan tidak dapat diakses tanpa pembatasan HTTP 403; foto pengguna menjadi acuan visual, dan kode implementasi dibuat sendiri.

## Pemeriksaan integrasi

- Chrome desktop 1440 px dan ponsel 390 px: ketiga dudukan, pergantian ikon, inlay, tulisan dengan font lokal, serta lima format unduhan berjalan tanpa error JavaScript. Tidak ditemukan overflow horizontal pada ponsel. Login/data pendukung memakai fixture lokal selama pemeriksaan, tanpa menulis ke database atau galeri.
- Source dirender dengan distribusi OpenSCAD WASM 2022.03.20 dari proyek resmi. Model timbul dan inlay menghasilkan `Simple: yes` tanpa peringatan mesh. STL hasil render dimuat kembali ke Manifold dan masing-masing memiliki dua solid valid (pelat dan alas).
- Tiang berlekuk menggunakan polyhedron bersegitiga pada source SCAD untuk menghindari kegagalan `linear_extrude(twist)` pada renderer lama. Volume hasil SCAD dan Manifold berbeda kurang dari 0,001% pada pengaturan bawaan.
- Dalam output SCAD gabungan, overlap internal 0,001 mm pada pertemuan warna mencegah celah pembulatan CGAL. Ekspor bagian individual dan ekspor langsung 3MF/STL dari generator tetap menggunakan batas bagian tanpa overlap.
