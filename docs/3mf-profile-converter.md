# Konverter profil 3MF

Tool **Profil Anycubic untuk 3MF** (`/tools/3mf-profile`) menerima proyek 3MF dari MakerWorld atau sumber lain, memvalidasi isinya, lalu membangun proyek OrcaSlicer baru untuk **Anycubic Kobra X 0.4 nozzle** dengan profil **QR Plate Detail**.

## Alur

1. Unggah atau jatuhkan satu file `.3mf` dengan ukuran maksimal 40 MB.
2. Sistem memeriksa geometri, transformasi, warna aktif, ukuran, jumlah plate, dan metadata objek.
3. Tinjau dimensi serta warna yang terdeteksi.
4. Pilih satu filament PLA inventori untuk setiap warna aktif. Warna berbeda boleh memakai material pengganti yang sama.
5. Pilih **Slice gram & waktu** untuk mengirim job ke worker OrcaSlicer. Hasil menampilkan total gram, durasi, gram per material, prime tower, dan jumlah pergantian filament.
6. Pilih **Konversi & download 3MF** untuk mengunduh proyek dengan warna slot filament dari material yang dipilih.
7. Buka hasil sebagai proyek di OrcaSlicer dan periksa preview layer sebelum mencetak.

File asli tidak diubah. Hasil memakai layer 0,12 mm, Arachne, dua dinding, infill gyroid 15%, PLA, textured PEI 60 °C, dan support nonaktif. Preset `Anycubic Kobra X 0.4 nozzle` harus tersedia di OrcaSlicer pengguna.

Pemilihan material dipakai untuk pemetaan slot, warna filament pada proyek hasil download, serta rincian estimasi gram. Slicing dari tool ini tidak mengurangi stok. Job dapat dipantau di **Antrian Slicer** dengan label `Profil Anycubic 3MF`.

## Keamanan dan batas

Konversi membaca mesh lokal dan metadata warna yang dikenal, lalu membuat arsip baru. Machine G-code, post-process, thumbnail, G-code hasil slice, gambar profil, dan lampiran dari file asal tidak disalin.

- Satu plate, maksimal empat warna aktif.
- Area model maksimal 260 × 260 × 260 mm.
- Modifier, negative part, volume Prusa, referensi model eksternal, serta XML yang tidak valid ditolak.
- Geometri, transformasi, dan painting warna yang didukung dipertahankan; susunan metadata objek khusus vendor tidak dijamin.
- Support dimatikan oleh profil. Orientasi, support, brim, material, dan toolpath harus diperiksa kembali di OrcaSlicer.
