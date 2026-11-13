# Gambar halaman disimpan terkompres 2000px

Tangkapan kamera HP berukuran 3–8MB per halaman; menyimpannya apa adanya menghabiskan kuota IndexedDB dengan cepat. Yang disimpan adalah gambar yang sudah dipotong, diberi filter, dan diperkecil ke sisi terpanjang 2000px (JPEG q0.92), cukup tajam untuk cetak A4 pada 240 DPI. Tangkapan asli dibuang setelah diproses, jadi memotong ulang memakai gambar terkompres itu — masih memadai, dan mencegah penyimpanan ganda.

Batas MVP: maksimal 50 Halaman per Dokumen, unggahan maksimal 20MB per file.