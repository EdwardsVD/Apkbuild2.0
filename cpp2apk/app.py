#!/usr/bin/env python3
"""
CPP to APK Builder — UI Gradio.

Menerima upload file .cpp berbasis raylib, memanggil build_scripts/build_apk.sh
(melakukan compile native ke .apk via gradle/NDK di dalam container),
dan menampilkan log console + kartu download APK.

UI bernuansa gelap menyerupai index.html lama (dark theme, drag & drop,
tombol build gradient).
"""

import os
import shutil
import subprocess
import uuid

import gradio as gr

# ---------------------------------------------------------------------------
# Konfigurasi
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_SCRIPT = os.path.join(BASE_DIR, "build_scripts", "build_apk.sh")
UPLOAD_DIR = "/tmp/uploads"
OUTPUT_DIR = "/tmp/outputs"
CSS_PATH = os.path.join(BASE_DIR, "static", "style.css")

BUILD_TIMEOUT = 2400  # detik (40 menit), gradle+NDK bisa lambat

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(CSS_PATH, encoding="utf-8") as _f:
    CUSTOM_CSS = _f.read()


# ---------------------------------------------------------------------------
# Logika build (generator agar console di-streaming ke UI)
# ---------------------------------------------------------------------------
def build_apk(cpp_file, progress=gr.Progress(track_tqdm=False)):
    lines = []

    def push(msg):
        lines.append(msg)
        return "".join(lines)

    if cpp_file is None:
        yield "❌ Belum ada file .cpp yang diupload.", None
        return

    build_id = uuid.uuid4().hex[:8]
    src_path = os.path.join(UPLOAD_DIR, f"{build_id}.cpp")

    try:
        shutil.copy(cpp_file.name, src_path)
    except OSError as exc:
        yield push(f"[ERROR] Gagal menyalin file: {exc}\n"), None
        return

    yield push(f"[INFO] File diterima: {os.path.basename(cpp_file.name)}\n"), None
    yield push(f"[INFO] Build ID: {build_id}\n"), None
    yield push("[RUN] Menjalankan gradle build (bisa 5–20 menit)...\n"), None

    try:
        proc = subprocess.Popen(
            ["bash", BUILD_SCRIPT, src_path, OUTPUT_DIR, build_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in proc.stdout:
            yield push(line), None

        proc.wait(timeout=BUILD_TIMEOUT)

        if proc.returncode != 0:
            yield push(f"\n[ERROR] Build gagal (exit code {proc.returncode}).\n"), None
            return

        apk_path = os.path.join(OUTPUT_DIR, f"cpp2apk_{build_id}.apk")
        if not os.path.exists(apk_path):
            yield push("\n[ERROR] Build selesai tapi APK tidak ditemukan di output.\n"), None
            return

        size_mb = os.path.getsize(apk_path) / (1024 * 1024)
        yield push(f"\n[OK] APK berhasil dibuat ({size_mb:.1f} MB).\n"), apk_path

    except subprocess.TimeoutExpired:
        yield push(f"\n[ERROR] Build timeout (> {BUILD_TIMEOUT // 60} menit).\n"), None
    except FileNotFoundError:
        yield push("\n[ERROR] build_apk.sh tidak ditemukan.\n"), None


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
with gr.Blocks(css=CUSTOM_CSS, title="CPP to APK Builder") as demo:
    gr.Markdown(
        "## 🎮 C++ (raylib) → APK Builder\n"
        "Upload file `.cpp`, dapatkan `.apk` Android siap install."
    )

    with gr.Row(equal_height=False):
        with gr.Column(scale=5):
            cpp_input = gr.File(
                label="Pilih / letakkan file .cpp",
                file_types=[".cpp", ".cc", ".cxx"],
                elem_id="cpp_input",
            )
            build_btn = gr.Button("🚀 BUILD APK", variant="primary", elem_id="build_btn")
        with gr.Column(scale=7):
            log_output = gr.Textbox(
                label="Console",
                lines=20,
                max_lines=60,
                interactive=False,
                elem_id="console",
            )
            apk_output = gr.File(label="Hasil APK", elem_id="apk_output")

    gr.Markdown(
        "> ℹ️ Build native (gradle + NDK) bisa memakan waktu **5–20 menit**. "
        "Pertama kali mungkin lebih lama karena compile raylib."
    )

    build_btn.click(fn=build_apk, inputs=[cpp_input], outputs=[log_output, apk_output])

demo.queue(max_size=5)


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
