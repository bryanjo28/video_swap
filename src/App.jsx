import { useEffect, useMemo, useRef, useState } from "react";
import aiFace from "./assets/ai_face.png";
import logoBcaFallback from "./assets/BCA_white.png";
import "./App.css";
import PreviewPage from "./PreviewPage.jsx";

const API_BASE_URL = "http://localhost:8000";
const COSTUMES_PER_PAGE = 4;

const toTitleCase = (value) =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const toMediaUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const normalized = String(path).replace(/^\.?\//, "");
  if (normalized.startsWith("/")) return `${API_BASE_URL}${normalized}`;
  return `${API_BASE_URL}/${normalized}`;
};

const normalizeCostumeItem = (item) => {
  const id = String(item?.id || "").trim();
  if (!id) return null;
  const gender = String(item?.gender || "").toLowerCase().trim();
  return {
    id,
    name: String(item?.name || toTitleCase(id)),
    gender,
    isActive: item?.isActive !== false,
    thumbUrl: toMediaUrl(item?.thumbPath),
  };
};

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [page, setPage] = useState("welcome");
  const [formData, setFormData] = useState({
    gender: "",
    consent: false,
  });
  const [formTouched, setFormTouched] = useState(false);

  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const [isBusy, setIsBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [pendingCapture, setPendingCapture] = useState("");
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [captureSource, setCaptureSource] = useState("camera");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedCostumeId, setSelectedCostumeId] = useState("");
  const [costumePageIndex, setCostumePageIndex] = useState(0);
  const [allCostumes, setAllCostumes] = useState([]);
  const [costumesLoading, setCostumesLoading] = useState(false);
  const [costumesError, setCostumesError] = useState("");

  const [lastShot, setLastShot] = useState(null);
  const [captureFilename, setCaptureFilename] = useState("");

  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState(""); // queued/running/done/error
  const [progress, setProgress] = useState(0);
  const [speedFps, setSpeedFps] = useState(0);
  const [jobMessage, setJobMessage] = useState("");
  const [processingStart, setProcessingStart] = useState(0);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");

  const busyText = useMemo(() => {
    if (countdown > 0) return `Get ready... ${countdown}`;
    if (isBusy) return status;
    return "";
  }, [countdown, isBusy, status]);

  const costumeOptions = useMemo(() => {
    const selectedGender = String(formData.gender || "").toLowerCase();
    if (!selectedGender) return [];
    return allCostumes.filter(
      (item) => item.isActive && item.gender === selectedGender
    );
  }, [allCostumes, formData.gender]);
  const totalCostumePages = Math.max(
    1,
    Math.ceil(costumeOptions.length / COSTUMES_PER_PAGE)
  );
  const visibleCostumes = useMemo(() => {
    const start = costumePageIndex * COSTUMES_PER_PAGE;
    return costumeOptions.slice(start, start + COSTUMES_PER_PAGE);
  }, [costumeOptions, costumePageIndex]);

  useEffect(() => {
    if (!costumeOptions.length) {
      setSelectedCostumeId("");
      setCostumePageIndex(0);
      return;
    }
    setSelectedCostumeId((current) =>
      costumeOptions.some((item) => item.id === current)
        ? current
        : costumeOptions[0].id
    );
    setCostumePageIndex((current) => Math.min(current, totalCostumePages - 1));
  }, [costumeOptions, totalCostumePages]);

  const loadCostumes = async () => {
    try {
      setCostumesLoading(true);
      setCostumesError("");

      const response = await fetch(`${API_BASE_URL}/costumes`);
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.message || "Failed to load costumes");
      }

      const sourceItems = Array.isArray(json?.items) ? json.items : [];
      const mappedItems = sourceItems
        .map(normalizeCostumeItem)
        .filter(Boolean);

      setAllCostumes(mappedItems);
      console.log("[costume] loaded", mappedItems);
    } catch (err) {
      const message = err?.message || String(err);
      setCostumesError(message);
      console.error("[costume] load error", message);
    } finally {
      setCostumesLoading(false);
    }
  };

  useEffect(() => {
    if (page !== "costume") return;
    if (allCostumes.length || costumesLoading) return;
    loadCostumes();
  }, [page, allCostumes.length, costumesLoading]);

  useEffect(() => {
    if (page !== "capture") return;
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
  }, [page]);


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
      const r = await fetch(`${API_BASE_URL}/status/${id}`);
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
    setProcessingStart(Date.now());
    setProcessingElapsed(0);
    setPreviewUrl("");

    const startPayload = {
      capture_filename: filename,
      costume_id: selectedCostumeId || undefined,
    };
    console.log("[start] payload", startPayload);

    const res = await fetch(`${API_BASE_URL}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startPayload),
    });

    const json = await res.json();
    console.log("[start] response", json);
    if (!res.ok || json.ok === false) {
      throw new Error(json.detail || "Failed to start job");
    }

    const id = json.job_id;
    setJobId(id);
    setStatus("Processing video...");
    const donePayload = await pollJob(id);
    if (donePayload?.preview_url) {
      setPreviewUrl(donePayload.preview_url);
    }
    setPage("preview");
  };

  const captureOnly = async () => {
    if (isBusy || countdown > 0) return;

    try {
      setError("");
      setIsBusy(true);

      setStatus("Preparing...");
      await runCountdown(3);

      setStatus("Capturing...");
      const dataUrl = captureFrameToDataUrl();
      setLastShot(dataUrl);
      setPendingCapture(dataUrl);
      setCaptureSource("camera");
      setSelectedFileName("");
      setShowCaptureModal(true);

      setStatus("Photo captured");
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus("Error");
    } finally {
      setIsBusy(false);
      if (!error) {
        setTimeout(() => setStatus("Camera ready"), 1200);
      }
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read selected file"));
      reader.readAsDataURL(file);
    });

  const handleGalleryClick = () => {
    if (isBusy || countdown > 0 || captureSubmitting) return;
    galleryInputRef.current?.click();
  };

  const handleCostumeSelect = (costumeId) => {
    setSelectedCostumeId(costumeId);
    console.log("[costume] selected", {
      costume_id: costumeId,
      gender: formData.gender,
    });
  };

  const handleGalleryFileChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type?.startsWith("image/")) {
        throw new Error("File harus berupa gambar.");
      }

      const maxBytes = 5 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error("Ukuran file maksimal 5MB.");
      }

      const dataUrl = await readFileAsDataUrl(file);
      setError("");
      setCaptureError("");
      setLastShot(dataUrl);
      setPendingCapture(dataUrl);
      setCaptureSource("gallery");
      setSelectedFileName(file.name);
      setShowCaptureModal(true);
      setStatus("Gallery photo selected");
    } catch (err) {
      const message = err?.message || String(err);
      setError(message);
      setStatus("Error");
    } finally {
      if (galleryInputRef.current) {
        galleryInputRef.current.value = "";
      }
    }
  };

  const processPendingCapture = async () => {
    if (!pendingCapture || isBusy || captureSubmitting) return;

    try {
      setError("");
      setCaptureError("");
      setCaptureSubmitting(true);

      // reset state job lama
      setCaptureFilename("");
      setJobId("");
      setJobStatus("");
      setProgress(0);
      setSpeedFps(0);
      setJobMessage("");

      setStatus("Uploading photo...");
      const res = await fetch(`${API_BASE_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: pendingCapture }),
      });

      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.detail || "Upload failed");
      }

      setCaptureFilename(json.filename);
      setStatus(`Photo saved: ${json.filename}`);
      setShowCaptureModal(false);

      await startSwapJob(json.filename);

      setStatus("Done");
    } catch (e) {
      console.error(e);
      const message = e?.message || String(e);
      setError(message);
      setCaptureError(message);
      setStatus("Error");
      setJobStatus("");
    } finally {
      setCaptureSubmitting(false);
      setIsBusy(false);
      if (!error) {
        setTimeout(() => setStatus("Camera ready"), 1200);
      }
    }
  };

  useEffect(() => {
    if (!processingStart || jobStatus === "done" || jobStatus === "error") return;
    const t = setInterval(() => {
      setProcessingElapsed(Math.floor((Date.now() - processingStart) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [processingStart, jobStatus]);

  const downloadUrl = jobId ? `${API_BASE_URL}/download/${jobId}` : "";
  const elapsedText = `${Math.floor(processingElapsed / 60)
    .toString()
    .padStart(2, "0")}:${(processingElapsed % 60).toString().padStart(2, "0")}`;

  const canContinue = formData.consent;
  const showConsentError = formTouched && !formData.consent;

  const handleContinue = () => {
    setFormTouched(true);
    if (!canContinue) return;
    setPage("costume");
  };

  if (page === "welcome") {
    return (
      <div className="welcomePage">
        <div className="welcomeStars" />
        <div className="welcomeGlow welcomeGlowA" />
        <div className="welcomeGlow welcomeGlowB" />
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
        <div className="welcomeCard">
          <div className="welcomeAvatarWrap">
            <div className="welcomeAvatarRing">
              <img className="welcomeAvatar" src={aiFace} alt="AI assistant" />
            </div>
          </div>
          <h1 className="welcomeTitle">
            Welcome to
            <span>BCA Gallery</span>
            <span>AI Video Generator</span>
          </h1>
          <button
            type="button"
            className="welcomeButton"
            onClick={() => setPage("intro")}
          >
            <span>Get Started</span>
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      </div>
    );
  }

  if (page === "intro") {
    return (
      <div className="introPage">
        <div className="introGlow introGlowA" />
        <div className="introGlow introGlowB" />
        <div className="introCard">
          <div className="introAvatar">
            <img className="introAvatarImg" src={aiFace} alt="AI face" />
          </div>
          <div className="introStep">Step 1 of 2</div>
          <div className="introTitle">Data Pengguna</div>
          <div className="introSub">
            Silakan centang persetujuan sebelum lanjut pilih costume.
          </div>

          <div className="introField">
            <label className="introCheckbox">
              <input
                type="checkbox"
                checked={formData.consent}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, consent: e.target.checked }))
                }
              />
              <span>
                Saya setuju menggunakan foto saya untuk proses face swap
              </span>
            </label>
            {showConsentError ? (
              <div className="introError">Anda harus menyetujui syarat ini.</div>
            ) : null}
          </div>

          <button
            className="introButton"
            type="button"
            onClick={handleContinue}
          >
            Lanjutkan
          </button>
          <div className="introHint">
            Selanjutnya kamu akan pilih gender dan costume.
          </div>
        </div>
      </div>
    );
  }

  if (page === "costume") {
    return (
      <div className="costumePage">
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

        <div className="costumeCard">
          <div className="costumeStep">Step 2 of 2</div>
          <div className="costumeGenderWrap">
            <div className="costumeGenderLabel">Choose Gender</div>
            <div className="costumeGenderRow">
              <button
                type="button"
                className={`genderBtn ${
                  formData.gender === "male" ? "isActive" : ""
                }`}
                onClick={() =>
                  setFormData((prev) => ({ ...prev, gender: "male" }))
                }
                aria-label="Male"
              >
                <span className="genderIcon maleIcon">♂</span>
                <span className="genderText">Male</span>
              </button>
              <button
                type="button"
                className={`genderBtn ${
                  formData.gender === "female" ? "isActive" : ""
                }`}
                onClick={() =>
                  setFormData((prev) => ({ ...prev, gender: "female" }))
                }
                aria-label="Female"
              >
                <span className="genderIcon femaleIcon">♀</span>
                <span className="genderText">Female</span>
              </button>
            </div>
          </div>
          <h2 className="costumeTitle">Choose Costume</h2>

          {costumesLoading ? (
            <div className="costumeEmpty">Loading costumes...</div>
          ) : costumesError ? (
            <div className="costumeEmpty">
              <div className="costumeErrorText">Gagal load costume: {costumesError}</div>
              <button
                type="button"
                className="costumeRetry"
                onClick={loadCostumes}
              >
                Coba Lagi
              </button>
            </div>
          ) : costumeOptions.length ? (
            <div className="costumeSelector">
              <button
                type="button"
                className="costumeArrow"
                onClick={() =>
                  setCostumePageIndex((current) => Math.max(0, current - 1))
                }
                disabled={costumePageIndex === 0}
                aria-label="Previous costume page"
              >
                &lt;
              </button>
              <div className="costumeGrid">
                {visibleCostumes.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`costumeItem ${
                      selectedCostumeId === item.id ? "isActive" : ""
                    }`}
                    style={{ "--costume-order": index }}
                    onClick={() => handleCostumeSelect(item.id)}
                  >
                    <img className="costumeImage" src={item.thumbUrl} alt={item.name} />
                    <div className="costumeName">{item.name}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="costumeArrow"
                onClick={() =>
                  setCostumePageIndex((current) =>
                    Math.min(totalCostumePages - 1, current + 1)
                  )
                }
                disabled={costumePageIndex >= totalCostumePages - 1}
                aria-label="Next costume page"
              >
                &gt;
              </button>
            </div>
          ) : (
            <div className="costumeEmpty">
              {formData.gender
                ? `Belum ada costume aktif untuk gender ${formData.gender}.`
                : "Pilih gender dulu untuk melihat costume."}
            </div>
          )}

          {costumeOptions.length > COSTUMES_PER_PAGE ? (
            <div className="costumePager">
              Page {costumePageIndex + 1} of {totalCostumePages}
            </div>
          ) : null}

          <div className="costumeActionsRow">
            <button
              type="button"
              className="costumeBack"
              onClick={() => setPage("intro")}
            >
              Back
            </button>
            <button
              type="button"
              className="costumeNext"
              onClick={() => setPage("capture")}
              disabled={!selectedCostumeId}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleBackFromPreview = () => {
    setPage("intro");
    // Reset job state so capture countdown overlay can show again.
    setJobId("");
    setJobStatus("");
    setProgress(0);
    setSpeedFps(0);
    setJobMessage("");
    setProcessingStart(0);
    setProcessingElapsed(0);
    setPreviewUrl("");
    setIsBusy(false);
    setCountdown(0);
  };

  if (page === "preview") {
    return (
      <PreviewPage
        previewUrl={previewUrl}
        downloadUrl={downloadUrl}
        onBack={handleBackFromPreview}
      />
    );
  }

  return (
    <div className="capturePage">
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleGalleryFileChange}
      />
      <div className="captureHeader">Ambil Foto</div>
      <div className="captureGreeting">
        <div className="captureGuide">Silakan posisikan wajah dalam bingkai</div>
      </div>

      <div className="captureBody">
        <div className="frameWrap">
          <div className="frameShell">
            <video ref={videoRef} className="frameVideo" playsInline muted />
            <div className="faceOval" />
          </div>
        </div>
      </div>

      <div className="captureActions">
        <button className="actionPill" type="button" onClick={() => setPage("costume")}>
          Kembali
        </button>
        <button
          className="actionMain"
          type="button"
          onClick={captureOnly}
          disabled={isBusy || countdown > 0}
        >
          {isBusy || countdown > 0 ? "Tunggu..." : "Ambil Foto"}
        </button>
        <button className="actionPill" type="button" onClick={handleGalleryClick}>
          Galeri
        </button>
      </div>

      <div className="captureStatus">
        <span className={`pill ${error ? "pillRed" : "pillGreen"}`}>
          {error ? "ERROR" : "READY"}
        </span>
        <span className="statusText">{status}</span>
      </div>

      {error ? <div className="errorText">{error}</div> : null}

      {showCaptureModal ? (
        <div className="modalOverlay">
          <div className="modalCard">
            <div className="modalTitle">
              {captureSource === "gallery"
                ? "Foto galeri siap diupload"
                : "Foto berhasil di capture"}
            </div>
            <div className="modalSub">
              {captureSource === "gallery"
                ? "Klik Submit untuk kirim ke backend."
                : "Lanjutkan generate video?"}
            </div>
            {captureSource === "gallery" && selectedFileName ? (
              <div className="modalMeta">{selectedFileName}</div>
            ) : null}
            {captureError ? (
              <div className="modalError">{captureError}</div>
            ) : null}
            {lastShot ? (
              <img className="modalPreview" src={lastShot} alt="preview" />
            ) : null}
            <div className="modalActions">
              <button
                className="btn ghost"
                onClick={() => {
                  setShowCaptureModal(false);
                  setPendingCapture("");
                  setCaptureError("");
                  setSelectedFileName("");
                }}
                disabled={captureSubmitting}
              >
                Ulangi
              </button>
              <button
                className="btn primary"
                onClick={processPendingCapture}
                disabled={captureSubmitting}
              >
                {captureSubmitting
                  ? "Tunggu..."
                  : captureSource === "gallery"
                    ? "Submit"
                    : "Lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(isBusy || countdown > 0) && !jobStatus && (
        <div className="busyOverlay">
          <div className="busyCard">
            <div className="spinner" />
            <div className="busyTitle">{busyText || "Working..."}</div>
            <div className="busySub">
              {countdown > 0 ? "Hold still..." : "Uploading / Processing..."}
            </div>
          </div>
        </div>
      )}

      {jobStatus === "queued" || jobStatus === "running" ? (
        <div className="processingOverlay">
          <div className="processingRing" />
          <div className="processingCard">
            <div className="processingTitle">Processing video...</div>
            <div className="processingSub">{jobMessage || "Processing frames..."}</div>
            <div className="processingTime">Time: {elapsedText}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

