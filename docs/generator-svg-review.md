# Pemeriksaan input keychain dan clicker — 11 September 2026

Perbaikan difokuskan pada kesetaraan bentuk antar sumber input. Alur teks yang sudah ada tetap diperiksa melalui suite tes. Perubahan lokal lain yang sudah ada di workspace dipertahankan.

## Temuan dan perbaikan

| Temuan | Perilaku setelah perbaikan |
| --- | --- |
| Masing-masing warna SVG dibalik terhadap bounding box sendiri, sehingga posisi antar elemen berubah. | Seluruh layer menggunakan satu acuan koordinat Y. |
| Stroke dibaca seperti bidang; garis terbuka bisa hilang atau menjadi bidang tertutup. | Stroke dikonversi menjadi kontur sesuai lebar, cap, join, serta transform, termasuk skala tidak seragam. |
| Konversi berbasis nesting tidak menyelesaikan subpath bertumpuk dan self-intersection. | Operasi polygon mengikuti `evenodd`/`nonzero`; lubang dan pulau di dalam lubang dipertahankan. Winding dinormalisasi sebelum ekstrusi. |
| Elemen tersembunyi dan geometri definisi ikut membentuk model. | `display="none"`, inline display, visibility, opacity nol, serta definisi yang tidak dirender diabaikan. |
| Referensi SVG2 `use href` bisa diabaikan loader. | Referensi lokal diekspansi dengan posisi, transform dan warna turunan; referensi hilang/berulang menghasilkan pesan yang jelas. |
| Logo terpisah menghasilkan backing terputus. | Backing keychain SVG dihubungkan dengan bridge pendek; artwork tetap terpisah sesuai desain. |
| Gabungan logo + teks bisa melampaui ukuran konten atau menempatkan attachment terhadap teks saja. | Komposisi dipasang ulang terhadap batas ukuran dan posisi attachment keseluruhan. Gap nol tidak diganti menjadi default. |
| Margin dan bentuk lid clicker diterapkan sebelum normalisasi, lalu diterapkan lagi di Manifold. | SVG/teks dikirim sebagai artwork asli; pembentukan plate dan margin dilakukan sekali. Nilai margin nol dipertahankan. |
| SVG clicker tipis dibesarkan berlebihan untuk switch; bentuk terpisah/cekung bisa tidak tersambung. | Backing SVG diberi dudukan switch dan penghubung sebelum well/base dihitung, sehingga clearance mengikuti lid. |
| Cavity warna clicker dipotong 0,01 mm lebih dalam daripada dasar inlay. | Inlay menyentuh backing, sehingga tidak menjadi pulau yang mengambang di ekspor. |
| Sampling vertex dan pengurangan titik convex hull mesh bisa memotong ujung footprint. | Semua vertex ikut menghitung hull; vertex hull tidak dibuang secara berkala. |
| Kegagalan Manifold pada SVG bisa beralih ke engine dengan kemampuan geometri berbeda. | SVG memerlukan Manifold, seperti mesh/flexi, agar hasil yang sudah diperbaiki tidak diam-diam berubah. SVG yang tersimpan dari mode lain juga tidak diparsing saat mode aktif bukan SVG. |

## Verifikasi

- `npm test`: 102 tes lulus, termasuk 36 tes tambahan (tes utama dan subtes).
- Parsing SVG diuji dengan DOM XML, SVGLoader dan operasi polygon asli. `happy-dom` ditambahkan sebagai dependency pengembangan untuk DOM di tes Node.
- Fixture: [compound](../tests/fixtures/svg/compound.svg), [disconnected](../tests/fixtures/svg/disconnected.svg), [strokes](../tests/fixtures/svg/strokes.svg), [narrow](../tests/fixtures/svg/narrow.svg).
- Keempat fixture diuji pada keychain logo saja, keychain logo + teks, clicker outline dan clicker circle. Pemeriksaan memakai Manifold asli dan handler worker clicker sebenarnya.
- Pemeriksaan 3D mencakup mesh tertutup, volume positif, sambungan backing/lid, tidak ada volume yang bertabrakan antara base dan insert/lid, serta kecocokan volume STL dengan preview.
- Margin 0, 1,2 dan 3 mm diperiksa pada clicker outline dan circle; lebar artwork harus mengikuti ukuran yang diminta tanpa margin ganda.
- STL dan 3MF mesh diuji dengan fixture silinder beresolusi tinggi; hull tetap lengkap dan hasil base/lid tertutup serta tersambung.
- Hasil tracing PNG dengan lubang diuji sampai konversi shape dan serialisasi input generator.
- `npm run build`: build produksi berhasil.
- Whitespace perubahan generator diperiksa. `git diff --check` seluruh workspace masih melaporkan blank line di `server/utils/rateLimit.js`, yang sudah ada sebelum pekerjaan ini.

## Batas dukungan dan pemeriksaan

SVG yang memakai teks hidup, clip-path, mask atau dashed stroke perlu diubah menjadi path/outline atau di-flatten terlebih dahulu. Generator memberikan pesan saat menemukan fitur tersebut pada pemeriksaan input; ini bukan renderer SVG lengkap. Symbol yang memakai viewBox juga perlu diekspansi menjadi path. Warna keychain/clicker tetap mengikuti pengaturan warna generator; pembacaan posisi layer bukan penambahan mode cetak semua warna SVG.

Pemeriksaan dilakukan melalui tes otomatis, geometri dan build. Interaksi halaman di browser, impor hasil ke slicer, dan cetak fisik belum diverifikasi. File mesh uji berupa solid terkontrol; ini tidak menjamin semua mesh impor yang rusak atau kompleks dapat diperbaiki otomatis. Tidak ada deploy pada pekerjaan ini.
