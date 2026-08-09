/**
 * gradioClient.ts — memanggil fungsi build_apk pada HF Space (Gradio) untuk
 * mengubah file .cpp menjadi .apk, memakai package resmi @gradio/client.
 *
 * Alur: connect ke Space → submit file → stream log build → dapatkan URL .apk.
 */
import { Client } from "@gradio/client";

export interface ApkOutput {
  name: string;
  url: string;
}

export interface BuildOutcome {
  log: string;
  apk: ApkOutput | null;
}

/** Bangun URL file yang benar dari output Gradio (bisa relatif / absolut). */
function resolveFileUrl(
  out: Record<string, unknown> | null | undefined,
  owner: string,
  space: string
): string | null {
  if (!out) return null;
  const raw =
    (out.url as string | undefined) ??
    (out.data as string | undefined) ??
    (out.path as string | undefined);
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith("/")) return `https://huggingface.co/spaces/${owner}/${space}${raw}`;
  return raw;
}

/**
 * Kirim file .cpp ke Space (Gradio) dan tunggu sampai .apk jadi.
 * `onLog` dipanggil untuk setiap baris console yang di-stream Space.
 */
export async function buildApkOnSpace(opts: {
  owner: string;
  space: string;
  token: string;
  file: File;
  onLog?: (chunk: string) => void;
  onStatus?: (msg: string) => void;
}): Promise<BuildOutcome> {
  const { owner, space, token, file, onLog, onStatus } = opts;

  onStatus?.(`Menghubungkan ke Space ${owner}/${space}...`);
  const app = await Client.connect(`${owner}/${space}`, {
    hf_token: token as `hf_${string}`,
  });

  onStatus?.(`Mengirim ${file.name} ke Space untuk di-compile ke .apk...`);

  let logAcc = "";
  let apk: ApkOutput | null = null;

  const iter = app.submit("build_apk", [file], undefined);
  for await (const evt of iter) {
    if (evt.type === "data") {
      const data = evt.data as unknown[];
      const logVal = data?.[0];
      if (typeof logVal === "string") {
        logAcc = logVal;
        onLog?.(logVal);
      }
      const out = data?.[1] as Record<string, unknown> | null | undefined;
      const url = resolveFileUrl(out, owner, space);
      if (url) {
        const name =
          (out?.orig_name as string | undefined) ||
          (out?.name as string | undefined) ||
          file.name.replace(/\.(cpp|cxx|cc)$/i, ".apk");
        apk = { name, url };
      }
    } else if (evt.type === "status" && (evt as { msg?: string }).msg === "complete") {
      break;
    }
  }

  return { log: logAcc, apk };
}
