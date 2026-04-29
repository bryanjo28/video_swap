import { useEffect, useRef, useState } from "react";
import logoBcaFallback from "./assets/BCA_white.png";
import processingVideo from "./assets/media1.mp4";

const API_BASE_URL = "http://localhost:8000";
const POLL_INTERVAL_MS = 1500;
const AUTO_CLEAR_MS = 5 * 60 * 1000;
const ACTIVE_STATUSES = new Set([
  "queued",
  "running",
  "preparing",
  "extracting",
  "processing",
  "encoding",
  "finalizing",
]);
const STAGE_LABELS = {
  queued: "Queued",
  running: "Preparing",
  preparing: "Preparing",
  extracting: "Extracting frames",
  processing: "Processing frames",
  encoding: "Encoding video",
  finalizing: "Finalizing output",
  done: "Done",
  error: "Error",
};
const STATUS_PROGRESS_FALLBACK = {
  queued: 0,
  running: 5,
  preparing: 10,
  extracting: 20,
  processing: 60,
  encoding: 90,
  finalizing: 95,
  done: 100,
  error: 0,
};

const toMediaUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const normalized = String(path).replace(/^\.?\//, "");
  if (normalized.startsWith("/")) return `${API_BASE_URL}${normalized}`;
  return `${API_BASE_URL}/${normalized}`;
};

const normalizeStatusPayload = (payload) => {
  const status = String(payload?.status || "idle").toLowerCase();
  return {
    ok: payload?.ok !== false,
    jobId: String(payload?.job_id || ""),
    status,
    previewUrl: toMediaUrl(payload?.preview_url || ""),
    downloadUrl: toMediaUrl(payload?.download_url || ""),
    createdAt: String(payload?.created_at || ""),
    message: String(payload?.message || ""),
    progress: Number(payload?.progress || 0),
    speedFps: Number(payload?.speed_fps || 0),
    stage: String(payload?.stage || status),
    processedFrames: Number(payload?.processed_frames || 0),
    totalFrames: Number(payload?.total_frames || 0),
  };
};

const normalizeDisplayPayload = (payload) => {
  return {
    ...normalizeStatusPayload(payload),
    ok: Boolean(payload?.ok),
  };
};

export default function DisplayPage() {
  const [displayState, setDisplayState] = useState({
    ok: true,
    jobId: "",
    status: "idle",
    previewUrl: "",
    downloadUrl: "",
    createdAt: "",
    message: "",
    progress: 0,
    speedFps: 0,
    stage: "idle",
    processedFrames: 0,
    totalFrames: 0,
  });
  const [requestError, setRequestError] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const lastJobIdRef = useRef("");
  const loadLatestDisplayRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadLatestDisplay = async () => {
      try {
        const displayResponse = await fetch(`${API_BASE_URL}/display/latest`, {
          cache: "no-store",
        });
        const displayJson = await displayResponse.json();
        if (!displayResponse.ok || displayJson?.ok === false) {
          throw new Error(
            displayJson?.detail || displayJson?.message || "Failed to load display state"
          );
        }

        let nextState = normalizeDisplayPayload(displayJson);
        if (nextState.jobId && ACTIVE_STATUSES.has(nextState.status)) {
          const statusResponse = await fetch(`${API_BASE_URL}/status/${nextState.jobId}`, {
            cache: "no-store",
          });
          const statusJson = await statusResponse.json();
          if (statusResponse.ok && statusJson?.ok !== false) {
            const liveState = normalizeStatusPayload(statusJson);
            nextState = {
              ...nextState,
              ...liveState,
              previewUrl: liveState.previewUrl || nextState.previewUrl,
              downloadUrl: liveState.downloadUrl || nextState.downloadUrl,
              createdAt: liveState.createdAt || nextState.createdAt,
            };
          }
        }

        if (!isMounted) return;
        setRequestError("");
        setDisplayState(nextState);
      } catch (error) {
        if (!isMounted) return;
        setRequestError(error?.message || String(error));
      }
    };
    loadLatestDisplayRef.current = loadLatestDisplay;

    loadLatestDisplay();
    const timer = window.setInterval(loadLatestDisplay, POLL_INTERVAL_MS);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!displayState.jobId || displayState.status !== "done") return;
    if (lastJobIdRef.current === displayState.jobId) return;
    lastJobIdRef.current = displayState.jobId;
  }, [displayState.jobId, displayState.status]);

  useEffect(() => {
    if (!displayState.jobId) return undefined;
    if (displayState.status !== "done" && displayState.status !== "error") {
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        setIsClearing(true);
        await fetch(`${API_BASE_URL}/display/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsClearing(false);
        await loadLatestDisplayRef.current?.();
      }
    }, AUTO_CLEAR_MS);

    return () => window.clearTimeout(timer);
  }, [displayState.jobId, displayState.status]);

  const isActive = ACTIVE_STATUSES.has(displayState.status);
  const isDone = displayState.status === "done" && displayState.previewUrl;
  const isError = displayState.status === "error";
  const stageKey = String(displayState.stage || displayState.status || "idle").toLowerCase();
  const processingProgress = Math.max(
    0,
    Math.min(
      100,
      Number.isFinite(displayState.progress) && displayState.progress > 0
        ? Math.round(displayState.progress)
        : STATUS_PROGRESS_FALLBACK[stageKey] ?? STATUS_PROGRESS_FALLBACK[displayState.status] ?? 0
    )
  );
  const hasFrameCounters = displayState.totalFrames > 0;
  const stageLabel =
    STAGE_LABELS[stageKey] ||
    displayState.message ||
    STAGE_LABELS[displayState.status] ||
    "Processing video...";
  const processingMeta = hasFrameCounters
    ? `${Math.min(displayState.processedFrames, displayState.totalFrames)}/${displayState.totalFrames} frames`
    : displayState.speedFps > 0
      ? `${displayState.speedFps.toFixed(2)} FPS`
      : stageLabel;

  const handleBack = async () => {
    if (!isActive && displayState.jobId) {
      try {
        setIsClearing(true);
        await fetch(`${API_BASE_URL}/display/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsClearing(false);
      }
    }

    window.location.href = "/";
  };

  if (requestError) {
    return (
      <div className="previewPage">
        <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div>
        <div className="previewHeader">Display</div>
        <div className="previewSub">{requestError}</div>
        <div className="previewFrameWrap">
          <div className="previewFrame">
            <div className="previewEmpty">Koneksi ke server bermasalah.</div>
          </div>
        </div>
        <div className="previewActions">
          <button className="actionPill" type="button" onClick={handleBack}>
            Kembali
          </button>
        </div>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="previewPage">
        <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div>
        <div className="previewHeader">Preview</div>
        <div className="previewSub">
          {displayState.createdAt
            ? `Created at ${displayState.createdAt}`
            : "Menampilkan hasil terbaru."}
        </div>

        <div className="previewFrameWrap">
          <div className="previewFrame">
            <video
              key={displayState.jobId}
              className="previewVideo"
              src={displayState.previewUrl}
              autoPlay
              muted
              playsInline
              loop
              controls={false}
            />
          </div>
        </div>
        <div className="previewActions">
          <button
            className="btn primary"
            type="button"
            onClick={handleBack}
            disabled={isClearing}
          >
            {isClearing ? "Loading..." : "Kembali"}
          </button>
        </div>
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="processingPage">
        <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div>
        <div className="processingCard">
          <video
            className="processingPreviewVideo"
            src={processingVideo}
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="processingStepLabel">Loading</div>
          <div className="processingTitle">Proses face swap oleh AI</div>
          <div className="processingSub">{displayState.message || stageLabel}</div>
          <div className="processingProgressWrap">
            <div
              className="processingProgressTrack"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={processingProgress}
            >
              <div
                className="processingProgressFill"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <div className="processingProgressText">{processingProgress}%</div>
          </div>
          <div className="processingMetaRow">
            <span>Status: {displayState.status}</span>
            <span>{processingMeta}</span>
          </div>
          <div className="previewActions">
            <button className="actionPill" type="button" onClick={handleBack}>
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="previewPage">
        <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div>
        <div className="previewHeader">Preview</div>
        <div className="previewSub">
          {displayState.message || "Proses gagal. Silakan ulangi dari layar utama."}
        </div>
        <div className="previewFrameWrap">
          <div className="previewFrame">
            <div className="previewEmpty">Preview belum tersedia.</div>
          </div>
        </div>
        <div className="previewActions">
          <button
            className="btn primary"
            type="button"
            onClick={handleBack}
            disabled={isClearing}
          >
            {isClearing ? "Loading..." : "Kembali"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="previewPage">
      <div className="welcomeBrand">
        <img
          className="welcomeBrandLogo"
          src="/src/assets/BCA_white.png"
          alt="BCA"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = logoBcaFallback;
          }}
        />
      </div>
      <div className="previewHeader">Preview</div>
      <div className="previewSub">Menunggu hasil terbaru.</div>
      <div className="previewFrameWrap">
        <div className="previewFrame">
          <div className="previewEmpty">Belum ada hasil untuk ditampilkan.</div>
        </div>
      </div>
      <div className="previewActions">
        <button className="actionPill" type="button" onClick={handleBack}>
          Kembali
        </button>
      </div>
    </div>
  );
}
