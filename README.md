# Theonescan

Pemindai dokumen PWA: kamera/unggah → potong perspektif → filter → ekspor PDF/JPEG/PNG atau bagikan ke WhatsApp. Tanpa backend; data di IndexedDB device. Lihat `GLOSSARY.md` dan `docs/adr/`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ -> Cloudflare Pages
npm run check      # self-check homografi + urutan halaman
```

Deploy: Cloudflare Pages, build command `npm run build`, output `dist`.

Tidak ada: OCR, deteksi tepi otomatis, sinkron/backend, undo-redo, trash. PC/server tidak bisa share file lewat Web Share — fallback ke unduh.