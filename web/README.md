# 🎮 CPP → APK Deployer (Web)

Satu halaman web (mobile-first) untuk **deploy otomatis Hugging Face Space**
(CPP to APK Builder) — user tinggal paste HF token, tekan tombol, dan seluruh
proses (buat repo Space, upload Dockerfile/app.py/dll) berjalan otomatis.

Murni **client-side** (Opsi A): request dikirim langsung dari browser ke
`huggingface.co` via package resmi [`@huggingface/hub`](https://www.npmjs.com/package/@huggingface/hub).
Token **tidak pernah** disimpan di localStorage/database, tidak dikirim ke
server lain, dan tidak di-log.

## Fitur

- Input Username / Org HF, Nama Space, dan Token HF (role Write).
- Field token `type="password"` + tombol show/hide (👁/🙈).
- Validasi nama Space (huruf kecil/angka/dash/titik) sebelum deploy.
- Validasi token via `whoAmI`, dan cek ketersediaan nama sebelum create
  (error jelas, bukan raw 409).
- Alur progress: `idle → validating → creating → uploading → waiting → done/error`.
- Console log live (auto-scroll), font monospace, background gelap `#060910`.
- Poll status runtime Space (`BUILDING` / `RUNNING` / `BUILD_ERROR`) setelah
  upload.
- Kartu hasil dengan link tap-able ke Space + tombol "Coba lagi" bila gagal.
- Dark theme + gradient `#22d3ee → #8b5cf6`, mobile-first, tap-target ≥ 44px.

## Struktur

```
web/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx          # UI + orchestrator deploy
    ├── hfClient.ts      # wrapper @huggingface/hub (create/upload/status)
    ├── templates.ts     # SPACE_FILES — isi file Space (via import ?raw)
    ├── index.css
    └── space_files/     # konten asli Space (Dockerfile, app.py, build_apk.sh, ...)
```

> `src/templates.ts` mengambil isi file Space langsung dari `space_files/`
> memakai import `?raw` Vite — byte-per-byte sama dengan yang di-push, tanpa
> risiko salah-escape `${...}`/backtick.

## Menjalankan

```bash
npm install
npm run dev      # dev server di http://localhost:5173
npm run build    # build produksi ke dist/
npm run preview  # preview hasil build
```

Deploy hasil `dist/` ke hosting statis apa pun (Vercel/Netlify/GitHub Pages).

## Keamanan token

Token diproses **langsung ke Hugging Face** dari browser Anda dan tidak
disimpan di server/manapun. Gunakan token role **Write** yang dibuat di
https://huggingface.co/settings/tokens.
