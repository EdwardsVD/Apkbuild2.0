#!/usr/bin/env bash
#
# build_apk.sh — inject file .cpp user ke template raymob lalu jalankan gradle build.
#
# Usage:
#   build_apk.sh <src_cpp> <out_dir> <build_id>
#
set -euo pipefail

SRC_CPP="$1"          # path file .cpp yang diupload user
OUT_DIR="$2"          # folder tujuan APK hasil build
BUILD_ID="$3"         # id unik per-request (hindari race condition antar user)

TEMPLATE="${RAYMOB_ROOT:-/opt/raymob}"
WORKDIR="/tmp/build_${BUILD_ID}"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-/opt/gradle-home}"

log()  { echo "[build] $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }

# 1. Validasi input
[ -n "$SRC_CPP" ]  || die "argumen src_cpp kosong"
[ -n "$OUT_DIR" ]  || die "argumen out_dir kosong"
[ -n "$BUILD_ID" ] || die "argumen build_id kosong"
[ -f "$SRC_CPP" ]  || die "file sumber tidak ditemukan: $SRC_CPP"
[ -d "$TEMPLATE" ] || die "template raymob tidak ditemukan di $TEMPLATE (build image belum selesai?)"

# 2. Salin template ke workspace sementara
rm -rf "$WORKDIR"
cp -r "$TEMPLATE" "$WORKDIR"

# 3. Bersihkan artefak build lama hasil warmup (jika ikut tersalin)
rm -rf "$WORKDIR/build" "$WORKDIR/app/build" "$WORKDIR/.gradle" \
       "$WORKDIR/app/.cxx" "$WORKDIR/app/build" 2>/dev/null || true

# 4. Ganti source game bawaan template dengan file .cpp user.
#    Template memakai app/src/main/cpp/main.c; kita buang main.c dan
#    pakai main.cpp milik user (CMakeLists template meng-glob *.c/*.cpp).
rm -f "$WORKDIR/app/src/main/cpp/main.c"
cp "$SRC_CPP" "$WORKDIR/app/src/main/cpp/main.cpp"

# 5. Beri application_id unik agar APK hasil build bisa diinstal berdampingan.
#    (NativeLoader.java / manifest disuntik otomatis oleh preBuild build.gradle.)
sed -i "s/^app\.application_id=.*/app.application_id=com.cpp2apk.b${BUILD_ID}/" "$WORKDIR/gradle.properties"
sed -i "s/^app\.name=.*/app.name=cpp2apk_${BUILD_ID}/" "$WORKDIR/gradle.properties"

# 6. Jalankan gradle build
cd "$WORKDIR"
chmod +x gradlew
log "Menjalankan: ./gradlew assembleDebug --no-daemon"
./gradlew assembleDebug --no-daemon --no-build-cache

# 7. Lokasi & salin APK hasil build
APK_PATH=$(find "$WORKDIR/app/build/outputs" -name "*.apk" 2>/dev/null | head -n1)
[ -n "$APK_PATH" ] || die "build selesai tapi APK tidak ditemukan"

mkdir -p "$OUT_DIR"
FINAL="${OUT_DIR}/cpp2apk_${BUILD_ID}.apk"
cp "$APK_PATH" "$FINAL"
log "APK siap: $FINAL"

# 8. Bersihkan workspace (hemat disk /tmp pada Space)
rm -rf "$WORKDIR"

echo "$FINAL"
