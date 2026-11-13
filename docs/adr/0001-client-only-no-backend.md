# Client-only, tanpa backend

Aplikasi ini dipakai satu orang di satu device. Semua pekerjaan — kamera, potong, filter, ekspor PDF/JPEG, dan bagikan lewat Web Share API — bisa dilakukan di browser, sehingga tidak ada backend. Data Dokumen disimpan di IndexedDB device itu.

Konsekuensi yang disadari: library dokumen tidak tersinkron antar-device. Jalur pindah device adalah Backup `.zip` manual (ekspor/impor), dan file hasil tetap bisa diunduh atau dibagikan ke siapa pun. Kalau nanti butuh sinkron otomatis, backend ditambahkan sebagai modul penyimpanan baru tanpa mengubah editor.