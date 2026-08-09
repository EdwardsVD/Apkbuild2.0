import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpace,
  commitFiles,
  validateToken,
  spaceExists,
  getSpaceStage,
  type SpaceStageInfo,
} from "./hfClient";
import { buildApkOnSpace, type ApkOutput } from "./gradioClient";
import { SPACE_FILES } from "./templates";
import { DEFAULT_HF_TOKEN, DEFAULT_HF_OWNER, DEFAULT_SPACE_NAME } from "./config";

type Tab = "build" | "deploy";
type Stage = "idle" | "validating" | "creating" | "uploading" | "waiting" | "building" | "done" | "error";

interface LogLine {
  text: string;
  kind: "info" | "ok" | "err" | "warn";
}

const POLL_DELAY_MS = 10000;
const POLL_ROUNDS = 12;

function isValidSpaceName(name: string): boolean {
  return /^[a-z0-9-][a-z0-9-.]*[a-z0-9-]$/.test(name) && name.length <= 96;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("build");

  // Shared auth fields
  const [owner, setOwner] = useState(DEFAULT_HF_OWNER);
  const [spaceName, setSpaceName] = useState(DEFAULT_SPACE_NAME);
  const [token, setToken] = useState(DEFAULT_HF_TOKEN);
  const [showToken, setShowToken] = useState(false);

  // Build (upload) state
  const [cppFile, setCppFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [spaceUrl, setSpaceUrl] = useState("");
  const [apk, setApk] = useState<ApkOutput | null>(null);
  const [running, setRunning] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const log = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    setLogs((prev) => [...prev, { text, kind }]);
  }, []);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  function resetConsole() {
    setLogs([]);
    setErrorMsg("");
    setSpaceUrl("");
    setApk(null);
    setStage("idle");
  }

  // ----- helpers -----
  async function ensureTokenAndOwner(): Promise<string> {
    const tok = token.trim();
    if (!tok) throw new Error("Token HF wajib diisi.");
    const resolved = owner.trim() || (await validateToken(tok));
    if (!owner.trim()) setOwner(resolved);
    return resolved;
  }

  /** Pastikan Space ada (buat + upload file bila belum) dan sedang RUNNING. */
  async function ensureSpaceReady(ns: string): Promise<void> {
    log(`[INFO] Cek Space "${ns}/${spaceName}"...`);
    const exists = await spaceExists(ns, spaceName);
    if (!exists) {
      log(`[INFO] Space belum ada → membuat...`);
      setStage("creating");
      const created = await createSpace(token.trim(), ns, spaceName);
      setSpaceUrl(created.repoUrl);
      log(`[OK] Space dibuat: ${created.repoUrl}`);
      setStage("uploading");
      log("[INFO] Upload file Space...");
      await commitFiles(token.trim(), ns, spaceName, SPACE_FILES, (m) => log(m));
      log("[OK] File Space terupload.");
    } else {
      log(`[OK] Space "${ns}/${spaceName}" sudah ada.`);
    }

    // Tunggu Space RUNNING
    setStage("waiting");
    let current: SpaceStageInfo = { stage: "NO_APP_FILE" };
    for (let i = 1; i <= POLL_ROUNDS; i++) {
      try {
        current = await getSpaceStage(ns, spaceName);
      } catch {
        log(`[WARN] Belum bisa baca status (${i}/${POLL_ROUNDS}).`, "warn");
        await sleep(POLL_DELAY_MS);
        continue;
      }
      log(`[INFO] Status Space: ${current.stage} (${i}/${POLL_ROUNDS}).`);
      if (current.stage === "RUNNING") return;
      if (isFatalStage(current.stage)) {
        throw new Error(
          `Space gagal (${current.stage}).${current.error ? " " + current.error : ""}`
        );
      }
      await sleep(POLL_DELAY_MS);
    }
    throw new Error(
      `Space masih ${current.stage} setelah menunggu. Pantau tab Logs Space lalu coba lagi.`
    );
  }

  // ----- BUILD APK -----
  async function handleBuild() {
    if (!cppFile) return log("[ERROR] Pilih / letakkan file .cpp dulu.", "err");
    if (!spaceName.trim()) return log("[ERROR] Nama Space wajib diisi.", "err");
    if (!isValidSpaceName(spaceName.trim()))
      return log("[ERROR] Nama Space tidak valid (huruf kecil/angka/dash).", "err");
    if (!token.trim()) return log("[ERROR] Token HF wajib diisi.", "err");

    setRunning(true);
    setErrorMsg("");
    setApk(null);
    setStage("validating");

    try {
      const ns = await ensureTokenAndOwner();

      log(`[INFO] Menyiapkan file: ${cppFile.name} (${(cppFile.size / 1024).toFixed(0)} KB)`);
      log(`[INFO] Owner: ${ns} | Space: ${spaceName}`);

      await ensureSpaceReady(ns);

      setStage("building");
      log("[RUN] Mengirim .cpp ke Space & menunggu APK jadi (bisa 5–20 menit)...");
      const outcome = await buildApkOnSpace({
        owner: ns,
        space: spaceName,
        token: token.trim(),
        file: cppFile,
        onLog: (chunk) => log(chunk),
        onStatus: (msg) => log(msg),
      });

      if (!outcome.apk) {
        throw new Error("Build selesai tapi APK tidak diterima dari Space.");
      }

      setApk(outcome.apk);
      setStage("done");
      log(`[OK] APK siap: ${outcome.apk.name}`, "ok");
    } catch (err) {
      setStage("error");
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      log(`[ERROR] ${msg}`, "err");
    } finally {
      setRunning(false);
    }
  }

  // ----- DEPLOY SPACE (tab terpisah) -----
  async function handleDeploy() {
    if (!spaceName.trim()) return log("[ERROR] Nama Space wajib diisi.", "err");
    if (!isValidSpaceName(spaceName.trim()))
      return log("[ERROR] Nama Space tidak valid (huruf kecil/angka/dash).", "err");
    if (!token.trim()) return log("[ERROR] Token HF wajib diisi.", "err");

    setRunning(true);
    setErrorMsg("");
    setSpaceUrl("");

    try {
      const ns = await ensureTokenAndOwner();
      setStage("validating");
      log(`[INFO] Memvalidasi token...`);
      const ownerInfo = await validateToken(token.trim());
      log(`[OK] Token valid untuk "${ownerInfo}".`);

      const exists = await spaceExists(ns, spaceName);
      if (exists) throw new Error(`Space "${ns}/${spaceName}" sudah ada. Gunakan nama lain.`);

      setStage("creating");
      log(`[INFO] Membuat Space ${ns}/${spaceName} (sdk: docker)...`);
      const created = await createSpace(token.trim(), ns, spaceName);
      setSpaceUrl(created.repoUrl);
      log(`[OK] Space dibuat: ${created.repoUrl}`);

      setStage("uploading");
      await commitFiles(token.trim(), ns, spaceName, SPACE_FILES, (m) => log(m));
      log("[OK] Semua file terupload.");

      setStage("waiting");
      log("[INFO] Space sedang build image (bisa 5–20 menit)...");
      await waitForRunning(ns);
      setStage("done");
      log("[OK] Deploy selesai. Space RUNNING.", "ok");
    } catch (err) {
      setStage("error");
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      log(`[ERROR] ${msg}`, "err");
    } finally {
      setRunning(false);
    }
  }

  async function waitForRunning(ns: string) {
    for (let i = 1; i <= POLL_ROUNDS; i++) {
      await sleep(POLL_DELAY_MS);
      let cur: SpaceStageInfo;
      try {
        cur = await getSpaceStage(ns, spaceName);
      } catch {
        continue;
      }
      log(`[INFO] Status Space: ${cur.stage} (${i}/${POLL_ROUNDS}).`);
      if (cur.stage === "RUNNING") return;
      if (isFatalStage(cur.stage))
        throw new Error(`Space gagal (${cur.stage}).${cur.error ? " " + cur.error : ""}`);
    }
    throw new Error("Space belum RUNNING setelah menunggu. Pantau tab Logs Space.");
  }

  // ----- file handling -----
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setCppFile(f);
  }

  const busy = running;

  return (
    <div className="wrap">
      <header>
        <div className="logo">🎮</div>
        <div>
          <h1>
            CPP <span className="g">→</span> APK <span className="g">Builder</span>
          </h1>
          <p className="sub">Upload .cpp → HF build → download .apk untuk HP</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs" role="tablist">
        <button
          className={tab === "build" ? "on" : ""}
          onClick={() => {
            setTab("build");
            resetConsole();
          }}
          role="tab"
          aria-selected={tab === "build"}
        >
          🚀 Build APK
        </button>
        <button
          className={tab === "deploy" ? "on" : ""}
          onClick={() => {
            setTab("deploy");
            resetConsole();
          }}
          role="tab"
          aria-selected={tab === "deploy"}
        >
          ⚙️ Deploy Space
        </button>
      </div>

      <div className="card formcard">
        <h2>Koneksi HF</h2>
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
              aria-label="Tampilkan/sembunyikan token"
              title="Tampilkan/sembunyikan token"
            >
              {showToken ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="o">Owner HF (auto jika kosong)</label>
          <input
            id="o"
            className="inp"
            placeholder="auto-dideteksi dari token"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="s">Nama Space</label>
          <input
            id="s"
            className="inp"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        {tab === "build" ? (
          <>
            <div
              className={`dz ${dragOver ? "over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
            >
              {cppFile ? (
                <div className="dzfile">
                  <div className="fname">📄 {cppFile.name}</div>
                  <div className="fmeta">{(cppFile.size / 1024).toFixed(1)} KB — ketuk untuk ganti</div>
                </div>
              ) : (
                <>
                  <div className="dzicon">⬆️</div>
                  <b>Letakkan / pilih file .cpp</b>
                  <span>game raylib (satu file), ketuk untuk browse</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".cpp,.cc,.cxx"
              style={{ display: "none" }}
              onChange={(e) => setCppFile(e.target.files?.[0] ?? null)}
            />
            <button className="build" onClick={handleBuild} disabled={busy} type="button">
              {busy && <span className="spin" />}
              {busy ? "MEMBANGUN APK..." : "📦 BUILD APK SEKARANG"}
            </button>
          </>
        ) : (
          <>
            <button className="build" onClick={handleDeploy} disabled={busy} type="button">
              {busy && <span className="spin" />}
              {busy ? "MENDEPLOY..." : "🚀 DEPLOY SPACE"}
            </button>
            <p className="hint">
              Buat Space docker baru + upload Dockerfile/app.py/build_apk.sh. Bila belum ada,
              tab <b>Build APK</b> otomatis melakukan ini sebelum compile.
            </p>
          </>
        )}

        <p className="disclaimer">
          <b>Keamanan:</b> Token diproses <b>langsung ke Hugging Face</b> dari browser Anda.
          Tidak disimpan di localStorage/database/server pihak ketiga.
        </p>
      </div>

      <div className="card consolecard">
        <h2>Console</h2>
        <div className="console" ref={consoleRef}>
          {logs.length === 0 && (
            <div style={{ color: "var(--dim)" }}>
              {">"} {tab === "build"
                ? "Upload .cpp lalu tekan BUILD APK. Space dibuat otomatis bila belum ada."
                : "Isi token lalu tekan DEPLOY SPACE."}
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} className={`l ${l.kind}`}>
              {l.text}
            </div>
          ))}
        </div>
      </div>

      {stage === "done" && tab === "build" && apk && (
        <div className="result">
          <div className="title">✅ APK berhasil dibuat!</div>
          <a className="openlink" href={apk.url} target="_blank" rel="noreferrer" download>
            ⬇️ Download {apk.name}
          </a>
          <p className="note">
            Buka link di HP Anda untuk menginstal APK (aktifkan <b>“install dari sumber
            tidak dikenal”</b>). Pastikan Space <b>{owner}/{spaceName}</b> tetap RUNNING.
          </p>
          <p className="note dimlink">
            Buka langsung: <a href={apk.url} target="_blank" rel="noreferrer">{apk.url}</a>
          </p>
        </div>
      )}

      {stage === "done" && tab === "deploy" && spaceUrl && (
        <div className="result">
          <div className="title">✅ Space berhasil dibuat!</div>
          <a className="openlink" href={spaceUrl} target="_blank" rel="noreferrer">
            Buka Space → {spaceUrl.replace(/^https?:\/\//, "")}
          </a>
          <p className="note">
            Image Docker sedang di-build. Setelah RUNNING, kembali ke tab <b>Build APK</b>{" "}
            untuk upload .cpp.
          </p>
        </div>
      )}

      {stage === "error" && (
        <div className="errbox">
          <div className="title">❌ Gagal</div>
          <div className="msg">{errorMsg}</div>
          <button className="retry" onClick={resetConsole} type="button">
            🔄 Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}

function isFatalStage(s: string): boolean {
  return (
    s === "BUILD_ERROR" ||
    s === "CONFIG_ERROR" ||
    s === "RUNTIME_ERROR" ||
    s === "NO_APP_FILE"
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
