import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpace,
  commitFiles,
  validateToken,
  spaceExists,
  getSpaceStage,
} from "./hfClient";
import { SPACE_FILES } from "./templates";

type Stage = "idle" | "validating" | "creating" | "uploading" | "waiting" | "done" | "error";

interface LogLine {
  text: string;
  kind: "info" | "ok" | "err" | "warn";
}

/** Aturan nama Space HF: huruf kecil, angka, dash, titik (tidak diawali/berakhir dash). */
function isValidSpaceName(name: string): boolean {
  return /^[a-z0-9-][a-z0-9-.]*[a-z0-9-]$/.test(name) && name.length <= 96;
}

const POLL_ROUNDS = 12; // maks 12× polling (~2 menit)
const POLL_DELAY_MS = 10000;

export default function App() {
  const [username, setUsername] = useState("");
  const [spaceName, setSpaceName] = useState("cpp2apk");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [spaceUrl, setSpaceUrl] = useState("");
  const [running, setRunning] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);

  const log = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    setLogs((prev) => [...prev, { text, kind }]);
  }, []);

  // Auto-scroll console ke bawah tiap baris baru
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const busy = running;

  async function handleDeploy() {
    // Validasi field
    if (!username.trim()) return log("[ERROR] Username HF wajib diisi.", "err");
    if (!spaceName.trim()) return log("[ERROR] Nama Space wajib diisi.", "err");
    if (!isValidSpaceName(spaceName.trim()))
      return log(
        "[ERROR] Nama Space tidak valid. Gunakan huruf kecil, angka, dash/titik (mis. cpp2apk-1).",
        "err"
      );
    if (!token.trim()) return log("[ERROR] Token HF wajib diisi.", "err");

    const ns = username.trim();
    const name = spaceName.trim();
    setRunning(true);
    setErrorMsg("");
    setSpaceUrl("");

    try {
      // 1) Validasi token + cek nama Space
      setStage("validating");
      log(`[INFO] Memvalidasi token...`);
      const owner = await validateToken(token.trim());
      log(`[OK] Token valid untuk user/org "${owner}".`);
      if (owner !== ns) {
        log(`[WARN] Token milik "${owner}", bukan "${ns}". Pastikan "${ns}" adalah pemilik/anggota Space.`, "warn");
      }

      log(`[INFO] Cek ketersediaan nama "${ns}/${name}"...`);
      const exists = await spaceExists(ns, name);
      if (exists) {
        throw new Error(`Space "${ns}/${name}" sudah ada. Gunakan nama lain.`);
      }
      log(`[OK] Nama tersedia.`);

      // 2) Buat Space
      setStage("creating");
      log(`[INFO] Membuat Space ${ns}/${name} (sdk: docker)...`);
      const created = await createSpace(token.trim(), ns, name);
      setSpaceUrl(created.repoUrl);
      log(`[OK] Space dibuat: ${created.repoUrl}`);

      // 3) Upload file
      setStage("uploading");
      log("[INFO] Upload file ke repo Space...");
      await commitFiles(token.trim(), ns, name, SPACE_FILES, (msg) => log(msg));
      log("[OK] Semua file terupload.");

      // 4) Tunggu build image
      setStage("waiting");
      log("[INFO] Space sedang build image di server HF (bisa 5–20 menit)...");
      let current: { stage: string; error?: string } = { stage: "NO_APP_FILE" };
      for (let i = 1; i <= POLL_ROUNDS; i++) {
        await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
        try {
          current = await getSpaceStage(ns, name);
        } catch {
          log(`[WARN] Belum bisa baca status runtime (percobaan ${i}).`, "warn");
          continue;
        }
        log(`[INFO] Status Space: ${current.stage} (${i}/${POLL_ROUNDS}).`);
        if (current.stage === "RUNNING") break;
        if (current.stage === "BUILD_ERROR" || current.stage === "CONFIG_ERROR" || current.stage === "RUNTIME_ERROR") {
          throw new Error(
            `Space gagal build (${current.stage}).${current.error ? " " + current.error : ""}`
          );
        }
      }

      setStage("done");
      log("[OK] Deploy selesai. Space bisa dibuka lewat link di bawah.", "ok");
      log(
        current.stage === "RUNNING"
          ? "[OK] Space sudah RUNNING."
          : `[INFO] Status terakhir: ${current.stage}. Bila masih BUILDING, pantau tab Logs Space.`,
        current.stage === "RUNNING" ? "ok" : "warn"
      );
    } catch (err) {
      setStage("error");
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      log(`[ERROR] ${msg}`, "err");
    } finally {
      setRunning(false);
    }
  }

  function handleRetry() {
    setLogs([]);
    setErrorMsg("");
    setSpaceUrl("");
    setStage("idle");
  }

  return (
    <div className="wrap">
      <header>
        <div className="logo">🎮</div>
        <div>
          <h1>
            CPP <span className="g">→</span> APK <span className="g">Deployer</span>
          </h1>
          <p className="sub">Deploy otomatis Hugging Face Space dari browser</p>
        </div>
      </header>

      <div className="card formcard">
        <h2>Konfigurasi Space</h2>
        <div className="field">
          <label htmlFor="u">Username / Org HF</label>
          <input
            id="u"
            className="inp"
            placeholder="mis. tomyhidayat"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="s">
            Nama Space{" "}
            <span className="dim" style={{ color: "var(--dim)" }}>
              lowercase, angka, dash
            </span>
          </label>
          <input
            id="s"
            className="inp"
            placeholder="cpp2apk"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="t">Token HF (role Write)</label>
          <div className="tokwrap">
            <input
              id="t"
              className="inp"
              type={showToken ? "text" : "password"}
              placeholder="hf_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="tokbtn"
              onClick={() => setShowToken((s) => !s)}
              title={showToken ? "Sembunyikan token" : "Tampilkan token"}
              aria-label={showToken ? "Sembunyikan token" : "Tampilkan token"}
            >
              {showToken ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        <button
          className="build"
          onClick={handleDeploy}
          disabled={busy}
          type="button"
        >
          {busy && <span className="spin" />}
          {busy ? "MENDEPLOY..." : "🚀 DEPLOY SEKARANG"}
        </button>

        <p className="disclaimer">
          <b>Keamanan:</b> Token diproses <b>langsung ke Hugging Face</b> dari browser Anda
          (huggingface.co). Token <b>tidak disimpan</b> di localStorage, database, atau server
          pihak ketiga mana pun. Jangan bagikan token kepada siapapun.
        </p>
      </div>

      <div className="card consolecard">
        <h2>Console</h2>
        <div className="console" ref={consoleRef}>
          {logs.length === 0 && (
            <div style={{ color: "var(--dim)" }}>
              {">"} Menunggu... isi form lalu tekan DEPLOY.
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} className={`l ${l.kind}`}>
              {l.text}
            </div>
          ))}
        </div>
      </div>

      {stage === "done" && (
        <div className="result">
          <div className="title">✅ Space berhasil dibuat!</div>
          <a
            className="openlink"
            href={spaceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Buka Space → {spaceUrl.replace(/^https?:\/\//, "")}
          </a>
          <p className="note">
            Image Docker sedang di-build (±5–20 menit). Pantau progress di tab{" "}
            <b>Logs</b> halaman Space. Setelah berjalan, buka Space lalu upload file{" "}
            <code>.cpp</code> untuk mendapat APK.
          </p>
        </div>
      )}

      {stage === "error" && (
        <div className="errbox">
          <div className="title">❌ Gagal deploy</div>
          <div className="msg">{errorMsg}</div>
          <button className="retry" onClick={handleRetry} type="button">
            🔄 Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}
