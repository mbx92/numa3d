# Profil cetak generator

Target awal: Anycubic Kobra X, nozzle 0,4 mm, PLA, dan textured plate. Profil merupakan titik awal untuk uji cetak, bukan hasil kalibrasi mesin atau jaminan hasil fisik.

## Pemakaian

1. Buat model di QR Plate, Keychain, atau Clicker.
2. Di panel ekspor, tinjau **Sertakan profil** beserta ringkasan pengaturannya.
3. Unduh 3MF dan buka sebagai **proyek** di OrcaSlicer dengan preset printer Kobra X terpasang.
4. Periksa pemetaan warna, support, brim, purge tower, dan preview hasil Slice sebelum mencetak.

Tombol **Slice gram & waktu** menjalankan CLI OrcaSlicer di server dengan proses yang sama yang tertanam di 3MF. Jendela desktop masih bisa beda jika filament atau flush di akun Orca sudah dikalibrasi. Lihat [slicing lokal untuk data produksi](slicing-hpp.md).

Pilihan profil berlaku untuk plate lengkap, ekspor per bagian, dan 3MF yang disimpan ke Galeri. Mengubah pilihan ini tidak memerlukan generate ulang geometri. Jika dimatikan, ekspor hanya membawa model, warna, layout, dan referensi printer; proses serta filament dipilih di OrcaSlicer. STL dan GLB tidak membawa profil cetak.

File 3MF dari MakerWorld atau sumber lain dapat diproses melalui **Tools → Profil Anycubic untuk 3MF**. Tool tersebut membuat proyek bersih, menerapkan profil QR Plate Detail, memetakan warna ke material inventori, dan dapat menjalankan slicing gram/waktu melalui worker OrcaSlicer; lihat [konverter profil 3MF](3mf-profile-converter.md).

## Nilai awal

| Profil | Layer | Dinding | Infill | Dinding luar | Permukaan atas |
| --- | --- | --- | --- | --- | --- |
| QR Plate Detail | 0,12 mm | 2 | 15% | 40 mm/s | 30 mm/s |
| Keychain Detail | 0,12 mm | 3 | 20% | 35 mm/s | 25 mm/s |
| Clicker Presisi | 0,16 mm | 3 | 20% | 35 mm/s | 30 mm/s |

Semua profil memakai layer pertama 0,2 mm, Arachne, lima lapisan atas/bawah, ironing nonaktif, dan kecepatan layer pertama 25 mm/s. Suhu awal mengikuti baseline preset Anycubic PLA Kobra X yang terpasang: nozzle 215 °C pada layer pertama, 205 °C berikutnya, serta textured bed 60 °C. 3MF juga membawa sisa proses Kobra X 0,16 mm High Quality (infill gyroid, prime tower, flush 70 mm³, kecepatan lain) supaya File → Open tidak mengisi kekosongan dari proses yang sedang dipilih di Orca. Profil proses di atas adalah pilihan awal Numa3D; angka kecepatan dan ketebalan belum divalidasi lewat cetak fisik.

Profil tidak menyertakan machine G-code, flow ratio, pressure advance, maupun perintah post-process. CLI memuat filament stok Anycubic PLA; desktop memakai salinan filament di akun Orca (termasuk kalibrasi flush). Toleransi geometri (rongga teks, socket switch, engsel, dan slot alas) tetap diatur pada generator; hasil cetaknya perlu diuji. Sesuaikan suhu dan kalibrasi dengan filament yang digunakan. Referensi: [kalibrasi toleransi OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer/wiki/tolerance_calib) dan [Arachne](https://www.orcaslicer.com/wiki/print_settings/quality/quality_settings_wall_generator).

Uji fisik yang perlu dilakukan:

- QR Plate: pemindaian QR, kebersihan batas warna, dan kecocokan slot alas.
- Keychain: ketajaman teks, kecocokan insert dengan rongga, dan kekuatan lubang gantungan.
- Clicker: kecocokan switch, sambungan lid/base, serta kebebasan gerak engsel bila digunakan.

## Implementasi dan verifikasi

- `utils/slicerProjectSettings.js`: satu sumber data profil untuk ringkasan UI dan isi ekspor; preset lama `pla-detail-0.4` tetap didukung.
- `utils/printProjectExport.js`: cache 3MF dipisahkan menurut profil sehingga perpindahan aktif/nonaktif tidak mengembalikan pengaturan lama.
- `utils/generatorPartExport.js`: meneruskan pilihan profil yang sama untuk unduhan dan Galeri.
- Mesh Clicker tetap tanpa profil proses otomatis secara default.

Tes: `node --test tests/slicerProfiles.test.js tests/printPlateExport.test.js tests/generatorPartExport.test.js tests/generatorIntegration.test.js tests/qrPlate.test.js`.

Verifikasi lokal mencakup 26 tes tersebut dan build produksi. Sampel nyata dari ketiga generator juga diimpor/disimpan ulang lewat CLI OrcaSlicer terpasang dengan `--arrange 0 --orient 0`. Layer, Arachne, jumlah dinding, infill, kecepatan, suhu, dan warna cocok dengan masukan. CLI diberi konfigurasi mesin/material serta pelengkap proses sementara; pelengkap proses tidak menimpa nilai cetak yang sedang diuji. Nilai vendor `retraction_distances_when_cut: 0`, yang ditolak validator CLI, dihilangkan hanya dari salinan profil mesin untuk pengujian. Profil instalasi pengguna dan G-code mesin pada aplikasi tidak diubah. Pemeriksaan ini bukan uji slicing penuh atau cetak fisik.
