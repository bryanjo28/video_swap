import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const [isBusy, setIsBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [lastShot, setLastShot] = useState(null);
  const [captureFilename, setCaptureFilename] = useState("");

  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState(""); // queued/running/done/error
  const [progress, setProgress] = useState(0);
  const [speedFps, setSpeedFps] = useState(0);
  const [jobMessage, setJobMessage] = useState("");

  const busyText = useMemo(() => {
    if (countdown > 0) return `Get ready… ${countdown}`;
    if (isBusy) return status;
    return "";
  }, [countdown, isBusy, status]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        setError("");
        setStatus("Requesting camera permission...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user",
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("Camera ready");
      } catch (e) {
        console.error(e);
        setError(e?.message || String(e));
        setStatus("Camera error");
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch (e) {
      console.error(e);
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runCountdown = async (sec = 3) => {
    setCountdown(sec);
    for (let t = sec; t >= 1; t--) {
      setCountdown(t);
      await sleep(700);
    }
    setCountdown(0);
  };

  const captureFrameToDataUrl = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) throw new Error("Camera not ready");

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video not ready yet. Try again in a moment.");
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.95);
  };

  const pollJob = async (id) => {
    while (true) {
      const r = await fetch(`http://localhost:8000/status/${id}`);
      const j = await r.json();

      if (!r.ok || j.ok === false) {
        throw new Error(j.detail || j.message || "Failed to read job status");
      }

      setJobStatus(j.status || "");
      setProgress(Number(j.progress || 0));
      setSpeedFps(Number(j.speed_fps || 0));
      setJobMessage(j.message || "");

      if (j.status === "done") return j;
      if (j.status === "error") throw new Error(j.message || "Processing error");

      await sleep(600);
    }
  };

  const startSwapJob = async (filename) => {
    setStatus("Starting swap job...");
    setJobId("");
    setJobStatus("queued");
    setProgress(0);
    setSpeedFps(0);
    setJobMessage("Queued");

    const res = await fetch("http://localhost:8000/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capture_filename: filename }),
    });

    const json = await res.json();
    if (!res.ok || json.ok === false) {
      throw new Error(json.detail || "Failed to start job");
    }

    const id = json.job_id;
    setJobId(id);
    setStatus("Processing video...");
    await pollJob(id);
  };

  const captureAndProcess = async () => {
    if (isBusy || countdown > 0) return;

    try {
      setError("");
      setIsBusy(true);

      // reset state job lama
      setCaptureFilename("");
      setJobId("");
      setJobStatus("");
      setProgress(0);
      setSpeedFps(0);
      setJobMessage("");

      setStatus("Preparing...");
      await runCountdown(3);

      setStatus("Capturing...");
      const dataUrl = captureFrameToDataUrl();
      setLastShot(dataUrl);

      setStatus("Uploading photo...");
      const res = await fetch("http://localhost:8000/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.detail || "Upload failed");
      }

      setCaptureFilename(json.filename);
      setStatus(`Photo saved: ${json.filename}`);

      // AUTO start swap
      await startSwapJob(json.filename);

      setStatus("Done ✅");
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus("Error");
      setJobStatus("error");
    } finally {
      setIsBusy(false);
      if (!error) {
        setTimeout(() => setStatus("Camera ready"), 1200);
      }
    }
  };

  const downloadUrl = jobId ? `http://localhost:8000/download/${jobId}` : "";

  return (
    <div className="kiosk">
      <video ref={videoRef} className="kioskVideo" playsInline muted />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="vignette" />

      {/* TOP BAR */}
      <div className="topBar">
        <div className="brand">
          <div className="brandDot" />
          <div className="brandText">
            <div className="brandTitle">Face Capture → Face Swap</div>
            <div className="brandSub">
              {jobStatus === "running"
                ? "Processing media1.mp4 with your captured face"
                : "Capture face, then auto-generate output video"}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={enterFullscreen} disabled={isBusy}>
            Fullscreen
          </button>
          <button
            className="btn primary"
            onClick={captureAndProcess}
            disabled={isBusy || countdown > 0}
          >
            {isBusy || countdown > 0 ? "Please wait…" : "Capture & Process"}
          </button>
        </div>
      </div>

      {/* CENTER GUIDE */}
      <div className="center">
        <div className="guideWrap">
          <div className="guideBox" />
          <div className="hint">
            Posisikan wajah di dalam kotak. Saat countdown, <b>diam sebentar</b>.
          </div>
        </div>
      </div>

      {/* BOTTOM */}
      <div className="bottomPanel">
        <div className="statusCard">
          <div className="statusRow">
            <span className={`pill ${error ? "pillRed" : "pillGreen"}`}>
              {error ? "ERROR" : "READY"}
            </span>
            <span className="statusText">{status}</span>
          </div>

          {error ? <div className="errorText">{error}</div> : null}

          {captureFilename ? (
            <div className="savedText">Capture: {captureFilename}</div>
          ) : null}

          {jobId ? (
            <div className="savedText">
              Job: <b>{jobId.slice(0, 8)}</b> • {jobStatus || "-"}
            </div>
          ) : null}

          {jobStatus ? (
            <div className="progressWrap">
              <div className="progressTop">
                <div className="progressLabel">{jobMessage || "Working..."}</div>
                <div className="progressMeta">
                  {progress}% {speedFps ? `• ${speedFps.toFixed(1)} fps` : ""}
                </div>
              </div>
              <div className="progressBar">
                <div className="progressFill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          {jobStatus === "done" ? (
            <div className="downloadRow">
              <a className="btn primary" href={downloadUrl} target="_blank" rel="noreferrer">
                Download Output MP4
              </a>
              <button className="btn ghost" onClick={() => window.location.reload()}>
                New Capture
              </button>
            </div>
          ) : null}
        </div>

        <div className="previewCard">
          <div className="previewTitle">Last shot</div>
          {lastShot ? (
            <img className="previewImg" src={lastShot} alt="last shot" />
          ) : (
            <div className="previewEmpty">No capture yet</div>
          )}
        </div>
      </div>

      {/* BUSY OVERLAY */}
      {(isBusy || countdown > 0) && (
        <div className="busyOverlay">
          <div className="busyCard">
            <div className="spinner" />
            <div className="busyTitle">{busyText || "Working..."}</div>
            <div className="busySub">
              {countdown > 0 ? "Hold still…" : "Uploading / Processing…"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
