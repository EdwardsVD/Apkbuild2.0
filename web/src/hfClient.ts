/**
 * hfClient.ts — wrapper pemanggilan HF Hub API via package resmi @huggingface/hub.
 *
 * SEMUA request dilakukan langsung dari browser ke huggingface.co (Opsi A).
 * Token TIDAK pernah disimpan di localStorage, TIDAK dikirim ke server lain,
 * dan TIDAK di-log. Token hanya dipakai per-request via header Authorization.
 */
import {
  createRepo,
  uploadFilesWithProgress,
  whoAmI,
  spaceInfo,
  type SpaceStage,
} from "@huggingface/hub";

/** RepoDesignation space: `{ type: "space", name: "<namespace>/<name>" }` */
function repoOf(namespace: string, name: string) {
  return { type: "space" as const, name: `${namespace}/${name}` };
}

/** Konversi error tak terduga jadi pesan yang bisa dibaca user. */
function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // 401 dari HF API → token bermasalah
    if (/401/.test(msg) || /Unauthorized|unauthorized/.test(msg)) {
      return "Token tidak valid atau sudah expired (401).";
    }
    if (/403/.test(msg)) {
      return "Akses ditolak (403) — cek izin token: pastikan role Write untuk akun ini.";
    }
    if (/404/.test(msg)) {
      return "Tidak ditemukan (404) — cek username / nama Space Anda.";
    }
    if (/409/.test(msg) || /already exists|alreadyexist/i.test(msg)) {
      return "Space dengan nama itu sudah ada. Gunakan nama lain.";
    }
    return msg;
  }
  return String(err);
}

/** Validasi token dengan memanggil whoAmI. Return username HF. */
export async function validateToken(token: string): Promise<string> {
  try {
    const me = await whoAmI({ accessToken: token });
    return me.name;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/** Cek apakah sebuah Space sudah ada. Throw Error("not-found") bila belum ada. */
export async function spaceExists(namespace: string, name: string): Promise<boolean> {
  try {
    await spaceInfo({ name: `${namespace}/${name}` });
    return true;
  } catch (err) {
    if (err instanceof Error && /404/.test(err.message)) return false;
    // kalau error selain 404, biarkan naik (mis. jaringan putus)
    throw err;
  }
}

/** Buat Space baru bertipe Docker. */
export async function createSpace(
  token: string,
  namespace: string,
  name: string
): Promise<{ repoUrl: string; id: string }> {
  try {
    return await createRepo({
      repo: repoOf(namespace, name),
      sdk: "docker",
      visibility: "public",
      accessToken: token,
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/**
 * Upload semua file Space via satu commit.
 * `onProgress` dipanggil per event upload (hash/upload/commit).
 */
export async function commitFiles(
  token: string,
  namespace: string,
  name: string,
  files: Record<string, string>,
  onProgress?: (msg: string) => void
): Promise<void> {
  const entries = Object.entries(files);
  onProgress?.(`Mengupload ${entries.length} file...`);

  const fileObjs = entries.map(([path, content]) => ({
    path,
    content: new Blob([content], { type: "text/plain;charset=utf-8" }),
  }));

  try {
    for await (const evt of uploadFilesWithProgress({
      repo: repoOf(namespace, name),
      accessToken: token,
      files: fileObjs,
      commitTitle: "Initial setup: cpp to apk builder",
    })) {
      if (evt.event === "phase") {
        const phaseLabels: Record<string, string> = {
          preuploading: "Pra-upload file...",
          uploadingLargeFiles: "Mengupload file besar...",
          committing: "Membuat commit...",
        };
        onProgress?.(phaseLabels[evt.phase] ?? `Fase: ${evt.phase}`);
      } else if (evt.event === "fileProgress") {
        const stateLabel =
          evt.state === "hashing" ? "hashing" : evt.state === "uploading" ? "uploading" : "error";
        onProgress?.(`${evt.path}: ${stateLabel} ${evt.progress}%`);
      }
    }
    onProgress?.("Semua file terupload & commit dibuat.");
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/** Ambil stage runtime Space (BUILDING / RUNNING / ERROR, dll). */
export async function getSpaceStage(
  namespace: string,
  name: string
): Promise<{ stage: SpaceStage; error?: string }> {
  try {
    const info = await spaceInfo({
      name: `${namespace}/${name}`,
      additionalFields: ["runtime"],
    });
    const runtime = info.runtime as { stage: SpaceStage; errorMessage?: string } | undefined;
    return {
      stage: runtime?.stage ?? "NO_APP_FILE",
      error: runtime?.errorMessage,
    };
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}
