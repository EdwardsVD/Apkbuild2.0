/**
 * templates.ts — isi file yang akan di-push ke HF Space.
 *
 * Konten DIAMBIL LANGSUNG dari file asli di `web/space_files/` melalui
 * import `?raw` Vite. Ini menjamin byte-per-byte sama dengan file Space
 * (Dockerfile/app.py/build_apk.sh/README.md/requirements.txt) yang sudah
 * divalidasi — tanpa risiko salah-escape `${...}` / backtick di template
 * literal TypeScript.
 */
import dockerfileRaw from "../space_files/Dockerfile?raw";
import appPyRaw from "../space_files/app.py?raw";
import readmeRaw from "../space_files/README.md?raw";
import buildApkShRaw from "../space_files/build_scripts/build_apk.sh?raw";
import requirementsRaw from "../space_files/requirements.txt?raw";

export const README_MD: string = readmeRaw;

export const DOCKERFILE: string = dockerfileRaw;

export const APP_PY: string = appPyRaw;

export const BUILD_APK_SH: string = buildApkShRaw;

export const REQUIREMENTS_TXT: string = requirementsRaw;

/**
 * Map path (di dalam repo Space) → isi file.
 * Urutan penting: README.md + app.py wajib ada supaya Space SDK Docker
 * terdeteksi dan bisa start.
 */
export const SPACE_FILES: Record<string, string> = {
  "README.md": README_MD,
  "Dockerfile": DOCKERFILE,
  "app.py": APP_PY,
  "build_scripts/build_apk.sh": BUILD_APK_SH,
  "requirements.txt": REQUIREMENTS_TXT,
};
