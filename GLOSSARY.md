# Theonescan

Aplikasi pemindai dokumen berbasis browser (PWA) untuk satu pengguna: ambil gambar lewat kamera atau unggah file, perbaiki perspektif, lalu ekspor atau bagikan sebagai PDF/JPEG/PNG. Tidak ada server; semua data tinggal di device.

## Language

**Dokumen**:
Satu kumpulan halaman yang diekspor menjadi satu file hasil.
_Avoid_: Proyek, file, arsip

**Halaman**:
Satu gambar hasil tangkapan atau unggahan di dalam sebuah Dokumen, beserta filter dan hasil potongnya.
_Avoid_: Lembar, scan, page

**Tangkapan**:
Gambar mentah satu halaman yang baru diambil dari kamera atau dipilih dari file, sebelum dipotong.
_Avoid_: Foto, image, snapshot

**Potong** (Crop):
Empat titik sudut pada Tangkapan yang menentukan area yang dipakai Halaman, beserta koreksi perspektifnya.
_Avoid_: Trim, edit tepi

**Filter**:
Preset tampilan satu Halaman: Original, Gray, B&W, atau Enhance.
_Avoid_: Efek, mode, style

**Enhance**:
Filter yang meregangkan histogram dan menetralkan warna lampu (gray-world) tanpa mengubah gambar asli.
_Avoid_: Auto-enhance, perbaikan otomatis

**Ekspor**:
Mengubah Dokumen menjadi satu file PDF, JPEG per Halaman, atau PNG per Halaman untuk diunduh.
_Avoid_: Convert, simpan, render

**Bagikan** (Share):
Mengirim hasil Ekspor ke aplikasi lain (WhatsApp dan sejenisnya) lewat share sheet sistem.
_Avoid_: Kirim WA, upload

**Backup**:
Satu file `.zip` berisi semua Dokumen dan Halamannya, untuk dipindah atau dipulihkan ke device lain.
_Avoid_: Sinkron, cloud, cadangan