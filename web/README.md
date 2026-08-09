# 🎮 CPP → APK Builder (Web)

Web app (mobile-first) untuk mengubah file `.cpp` berbasis **raylib** menjadi
`.apk` Android **secara instan** via Hugging Face:

**User upload `.cpp` → web kirim ke HF (pakai token user) → Space yang sudah
di-setup meng-compile ke `.apk` → `.apk` balik ke web untuk didownload & diinstall.**

Space HF dibuat **otomatis** bila belum ada (buat repo + upload Dockerfile/app.py/build_apk.sh).

Murni **client-side** (Opsi A): request langsung dari browser ke `huggingface.co`
via package resmi [`@huggingface/hub`](https://www.npmjs.com/package/@huggingface/hub)
(deploy) dan [`@gradio/client`](https://www.npmjs.com/package/@gradio/client)
(panggil fungsi build di Space). Token **tidak pernah** disimpan di
localStorage/database/server pihak ketiga.

## Fitur

- **Tab 🚀 Build APK**: upload `.cpp` (drag & drop) → otomatis validasi token,
  buat Space bila perlu, tunggu RUNNING, lalu compile → kartu **Download APK**.
- **Tab ⚙️ Deploy Space**: buat Space docker + upload file manual.
- Owner HF **auto-dideteksi dari token** (`whoAmI`) — tak perlu ketik username.
- Token `type=password` + tombol 👁/🙈; nilai default dari `.env` (`VITE_HF_TOKEN`).
- Validasi nama Space & pesan error spesifik (401/403/409).
- Console log live (auto-scroll, monospace, background `#060910`).
- Dark theme + gradient `#22d3ee → #8b5cf6`, mobile-first, tap-target ≥ 44px.

## Alur Build APK

`idle → validating → creating (bila perlu) → uploading (bila perlu) → waiting → building → done/error`

1. Validasi token & deteksi owner.
2. Pastikan Space `owner/space` ada & **RUNNING** (buat + upload file bila belum).
3. Connect via `@gradio/client` ke fungsi `build_apk` Space.
4. Kirim file `.cpp`, stream log build, terima URL `.apk`.
5. Tampilkan tombol download APK.

## Struktur

```
web/
├── index.html
├── package.json / package-lock.json
├── vite.config.ts
├── tsconfig.json
├── .env.example           # contoh env (JANGAN commit .env berisi token asli)
└── src/
    ├── main.tsx
    ├── App.tsx            # UI + orchestrator (tab Build / Deploy)
    ├── hfClient.ts        # wrapper @huggingface/hub (create/upload/status)
    ├── gradioClient.ts    # wrapper @gradio/client (panggil build_apk → .apk)
    ├── templates.ts       # SPACE_FILES — isi file Space (import ?raw)
    ├── config.ts          # nilai default dari env
    ├── index.css
    └── space_files/       # konten asli Space (Dockerfile, app.py, build_apk.sh, ...)
```

> `src/templates.ts` mengambil isi file Space langsung dari `space_files/`
> via import `?raw` Vite — byte-per-byte sama dengan yang di-push.

## Menjalankan

```bash
cp .env.example .env      # isi VITE_HF_TOKEN (opsional untuk prefill)
npm install
npm run dev               # http://localhost:5173
npm run build             # produksi ke dist/
npm run preview
```

Deploy `dist/` ke hosting statis apa pun (Vercel/Netlify/GitHub Pages).

## ⚠️ Keamanan token

- **JANGAN commit `.env` ke repo publik** — token akan bocor ke siapa pun.
- Token diproses **langsung ke Hugging Face** dari browser Anda, tidak
  disimpan di server/manapun.
- Karena repo ini **publik**, token sengaja **tidak di-hardcode** di source.
  Set via `.env` (build lokal) atau tempel manual di UI.
- Bila repo/space jadi publik dan token sempat ter-ekspos, **rotasi token** di
  https://huggingface.co/settings/tokens.
