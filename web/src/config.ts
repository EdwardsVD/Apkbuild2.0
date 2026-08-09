/**
 * config.ts — nilai default yang bisa di-override via env (Vite).
 *
 * Token TIDAK di-hardcode di source ini. Isi lewat file `.env` (gitignored)
 * atau tempel manual di UI. JANGAN pernah commit token asli ke repo publik.
 */
const env = import.meta.env;

/** Token HF default (role Write) — dari VITE_HF_TOKEN di .env. Kosong = paste manual. */
export const DEFAULT_HF_TOKEN: string = (env.VITE_HF_TOKEN as string | undefined) ?? "";

/** Owner HF default — VITE_HF_OWNER. Auto-dideteksi dari token bila kosong. */
export const DEFAULT_HF_OWNER: string = (env.VITE_HF_OWNER as string | undefined) ?? "";

/** Nama Space default. HF wajib huruf kecil / angka / dash. */
export const DEFAULT_SPACE_NAME: string =
  (env.VITE_HF_SPACE as string | undefined) ?? "cpp2apk";
