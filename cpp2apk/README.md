---
title: CPP to APK Builder
emoji: 🎮
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# C++ (raylib) → APK Builder

Upload file `.cpp` berbasis raylib, dapatkan `.apk` Android hasil compile.

CPU only — tidak menggunakan GPU/ZeroGPU sama sekali.

---

## Cara kerja

Space ini menjalankan server **Gradio** di dalam container Docker. Setiap kali
user mengupload sebuah file `.cpp` (game berbasis **raylib**) dan menekan
**BUILD APK**:

1. Script `build_scripts/build_apk.sh` menyalin template Android **raymob**
   (`Bigfoot71/raymob` — template raylib yang aktif dipelihara) ke direktori
   kerja sementara `/tmp/build_<id>`.
2. File `.cpp` upload-an user menggantikan `app/src/main/cpp/main.c` bawaan
   template (diubah menjadi `main.cpp`).
3. `./gradlew assembleDebug` meng-compile raylib + kode user menjadi `.apk`
   debug (native code via NDK + CMake).
4. APK hasil disalin ke `/tmp/outputs/cpp2apk_<id>.apk` dan disajikan ke user
   untuk didownload.

Template **raymob** (beserta submodule raylib) sudah di-clone **sekali saat
build image**, jadi setiap request tidak perlu clone ulang. Gradle + AGP + NDK
juga di-*warm* saat build image agar build per-request lebih cepat.

## Catatan penting

- **Format file**: satu file `.cpp` / `.cxx` / `.cc` dengan `#include "raylib.h"`
  dan fungsi `int main(void)`. Untuk kompatibilitas Android, gunakan input
  sentuh (`GetTouchPosition`), bukan keyboard/mouse.
- **Aset**: hanya kode saja yang dikompilasi. File gambar/suara tidak di-embed,
  jadi hindari `LoadTexture`/`LoadSound` dari path file kecuali sudah disiapkan
  sebagai asset.
- **Build image pertama** (±10–20 menit) dan **build APK per-request**
  (±5–20 menit) membutuhkan waktu — wajar, karena kompilasi native.
- **Keamanan**: Space ini publik berarti siapapun bisa mengupload kode C++ dan
  mengkompilasinya di server HF. Bila khawatir abuse, set Space ke **private**
  atau tambahkan autentikasi/rate-limit sederhana.

## Struktur repo

```
cpp2apk/
├── Dockerfile                 # image: JDK17 + Android SDK/NDK + CMake + raymob
├── app.py                     # UI Gradio (dark theme, drag & drop, console log)
├── requirements.txt           # gradio
├── README.md                  # metadata Space (YAML front-matter wajib)
├── build_scripts/
│   └── build_apk.sh           # inject .cpp user → gradle build → .apk
├── static/
│   └── style.css              # styling Gradio (dark theme seperti index.html lama)
├── examples/
│   └── sample.cpp             # contoh game raylib sederhana untuk tes
└── deploy.sh                  # buat + push Space (minta token Write, tidak di-hardcode)
```

## Deploy (opsional, via Claude Code / manual)

User hanya perlu menyiapkan **HF token role Write** dan username-nya.
Lihat `deploy.sh` dan README bagian bawah dari dokumen setup.

```bash
# Instal dependensi python lokal untuk gradio (kalau mau tes app.py langsung)
python3 -m pip install -r requirements.txt
```
