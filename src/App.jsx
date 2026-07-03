import { useEffect, useMemo, useRef, useState } from "react";
import aiFace from "./assets/ai_face.png";
import logoBcaFallback from "./assets/BCA_white.png";
import manIcon from "./assets/man_icon.png";
import womanIcon from "./assets/woman_icon.png";
import "./App.css";

const API_BASE_URL = "http://localhost:8000";
const COSTUMES_PER_PAGE = 4;
const COSTUME_REFRESH_INTERVAL_MS = 5000;
const JOB_LOCK_REFRESH_INTERVAL_MS = 2000;
const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "done"]);
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
  const frameShellRef = useRef(null);
  const faceOvalRef = useRef(null);
  const loadCostumesRef = useRef(null);
  const loadJobLockStateRef = useRef(null);

  const [page, setPage] = useState("welcome");
  const [formData, setFormData] = useState({
    gender: "",
  });
  const [genderTouched, setGenderTouched] = useState(false);
  const [genderWarning, setGenderWarning] = useState("");

  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const [isBusy, setIsBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [pendingCapture, setPendingCapture] = useState("");
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [captureResultStatus, setCaptureResultStatus] = useState("");
  const [captureResultTitle, setCaptureResultTitle] = useState("");
  const [captureResultSub, setCaptureResultSub] = useState("");
  const [captureSource, setCaptureSource] = useState("camera");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedCostumeId, setSelectedCostumeId] = useState("");
  const [costumePageIndex, setCostumePageIndex] = useState(0);
  const [allCostumes, setAllCostumes] = useState([]);
  const [costumesLoading, setCostumesLoading] = useState(false);
  const [costumesError, setCostumesError] = useState("");

  const [lastShot, setLastShot] = useState(null);
  const [captureFilename, setCaptureFilename] = useState("");
  const [activeJobState, setActiveJobState] = useState({
    jobId: "",
    status: "idle",
    message: "",
  });

  const [, setJobId] = useState("");
  const [, setJobStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [, setSpeedFps] = useState(0);
  const [, setJobMessage] = useState("");
  const [, setJobStage] = useState("queued");
  const [, setProcessedFrames] = useState(0);
  const [, setTotalFrames] = useState(0);
  const [, setPreviewUrl] = useState("");

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

  const genderAvailability = useMemo(() => {
    const activeCostumes = allCostumes.filter((item) => item.isActive);
    return {
      male: activeCostumes.some((item) => item.gender === "male"),
      female: activeCostumes.some((item) => item.gender === "female"),
    };
  }, [allCostumes]);

  const selectedGenderLabel = formData.gender
    ? formData.gender.charAt(0).toUpperCase() + formData.gender.slice(1)
    : "";

  const showGenderError = genderTouched && !formData.gender;
  const isJobLocked = ACTIVE_JOB_STATUSES.has(activeJobState.status);
  const jobLockMessage =
    activeJobState.status === "done"
      ? "Hasil sebelumnya masih tampil di display. Tunggu sampai preview selesai."
      : activeJobState.status === "queued" || activeJobState.status === "running"
        ? "Proses AI masih berjalan. Tunggu sampai proses sebelumnya selesai."
        : "";

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

  const resetJobState = () => {
    setJobId("");
    setJobStatus("");
    setProgress(0);
    setSpeedFps(0);
    setJobMessage("");
    setJobStage("queued");
    setProcessedFrames(0);
    setTotalFrames(0);
    setPreviewUrl("");
  };

  const resetFlow = () => {
    setPage("welcome");
    setFormData({ gender: "" });
    setGenderTouched(false);
    setGenderWarning("");
    setStatus("Ready");
    setError("");
    setIsBusy(false);
    setCountdown(0);
    setShowCaptureModal(false);
    setPendingCapture("");
    setCaptureSubmitting(false);
    setCaptureError("");
    setCaptureResultStatus("");
    setCaptureResultTitle("");
    setCaptureResultSub("");
    setCaptureSource("camera");
    setSelectedFileName("");
    setSelectedCostumeId("");
    setCostumePageIndex(0);
    setLastShot(null);
    setCaptureFilename("");
    resetJobState();
  };

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
      const mappedItems = sourceItems.map(normalizeCostumeItem).filter(Boolean);

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

  loadCostumesRef.current = loadCostumes;

  const loadJobLockState = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/display/latest`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.message || "Failed to load display state");
      }

      const nextStatus = String(json?.status || "idle").toLowerCase();
      setActiveJobState({
        jobId: String(json?.job_id || ""),
        status: nextStatus,
        message: String(json?.message || ""),
      });
    } catch (err) {
      console.error("[job-lock] failed to load display state", err);
    }
  };

  loadJobLockStateRef.current = loadJobLockState;

  useEffect(() => {
    if (page !== "gender" && page !== "costume") return;

    loadCostumesRef.current?.();

    const intervalId = window.setInterval(() => {
      loadCostumesRef.current?.();
    }, COSTUME_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [page]);

  useEffect(() => {
    if (page !== "costume") return undefined;

    loadJobLockStateRef.current?.();

    const intervalId = window.setInterval(() => {
      loadJobLockStateRef.current?.();
    }, JOB_LOCK_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [page]);

  useEffect(() => {
    if (page !== "capture") return;

    const startCamera = async () => {
      try {
        setError("");

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
        setStatus("Error");
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [page]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const runCountdown = async (sec = 3) => {
    setCountdown(sec);
    for (let t = sec; t >= 1; t -= 1) {
      setCountdown(t);
      await sleep(700);
    }
    setCountdown(0);
  };

  const captureFrameToDataUrl = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const frameShell = frameShellRef.current;
    const faceOval = faceOvalRef.current;
    if (!video || !canvas) throw new Error("Camera not ready");

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video not ready yet. Try again in a moment.");
    }

    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    canvas.width = sourceW;
    canvas.height = sourceH;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, sourceW, sourceH);

    if (frameShell && faceOval) {
      const shellRect = frameShell.getBoundingClientRect();
      const ovalRect = faceOval.getBoundingClientRect();
      if (shellRect.width > 0 && shellRect.height > 0) {
        const shellW = shellRect.width;
        const shellH = shellRect.height;
        const coverScale = Math.max(shellW / sourceW, shellH / sourceH);
        const drawnW = sourceW * coverScale;
        const drawnH = sourceH * coverScale;
        const offsetX = (shellW - drawnW) / 2;
        const offsetY = (shellH - drawnH) / 2;

        const ovalX = ovalRect.left - shellRect.left;
        const ovalY = ovalRect.top - shellRect.top;
        const rawSrcX = (ovalX - offsetX) / coverScale;
        const rawSrcY = (ovalY - offsetY) / coverScale;
        const rawSrcW = ovalRect.width / coverScale;
        const rawSrcH = ovalRect.height / coverScale;

        const paddingX = rawSrcW * 0.16;
        const paddingY = rawSrcH * 0.2;
        const paddedSrcX = Math.max(0, Math.round(rawSrcX - paddingX));
        const paddedSrcY = Math.max(0, Math.round(rawSrcY - paddingY));
        const paddedSrcW = Math.max(
          1,
          Math.min(sourceW - paddedSrcX, Math.round(rawSrcW + paddingX * 2))
        );
        const paddedSrcH = Math.max(
          1,
          Math.min(sourceH - paddedSrcY, Math.round(rawSrcH + paddingY * 2))
        );

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = paddedSrcW;
        cropCanvas.height = paddedSrcH;
        const cropCtx = cropCanvas.getContext("2d");
        cropCtx.drawImage(
          canvas,
          paddedSrcX,
          paddedSrcY,
          paddedSrcW,
          paddedSrcH,
          0,
          0,
          paddedSrcW,
          paddedSrcH
        );

        return cropCanvas.toDataURL("image/jpeg", 0.95);
      }
    }

    return canvas.toDataURL("image/jpeg", 0.95);
  };

  const startSwapJob = async (filename, costumeId) => {
    resetJobState();
    setJobStatus("queued");
    setJobMessage("Queued");

    const startPayload = {
      capture_filename: filename,
      costume_id: costumeId || undefined,
    };

    const res = await fetch(`${API_BASE_URL}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startPayload),
    });

    const json = await res.json();
    if (!res.ok || json.ok === false) {
      throw new Error(json.detail || "Failed to start job");
    }

    const id = json.job_id;
    setJobId(id);
    return id;
  };

  const captureOnly = async () => {
    if (isBusy || countdown > 0) return;

    try {
      setError("");
      setIsBusy(true);
      await runCountdown(3);

      const dataUrl = captureFrameToDataUrl();
      setLastShot(dataUrl);
      setPendingCapture(dataUrl);
      setCaptureSource("camera");
      setSelectedFileName("");
      await processPendingCapture({
        image: dataUrl,
        source: "camera",
        fileName: "",
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus("Error");
      setIsBusy(false);
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read selected file"));
      reader.readAsDataURL(file);
    });

  const resetCaptureModal = async () => {
    const filenameToDelete = captureFilename;

    try {
      if (filenameToDelete) {
        await fetch(`${API_BASE_URL}/capture/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capture_filename: filenameToDelete }),
        });
      }
    } catch (e) {
      console.error("[capture] delete failed", e);
    } finally {
      setShowCaptureModal(false);
      setPendingCapture("");
      setCaptureError("");
      setCaptureFilename("");
      setCaptureResultStatus("");
      setCaptureResultTitle("");
      setCaptureResultSub("");
      setSelectedFileName("");
      setLastShot(null);
      setError("");
      setStatus("Camera ready");
    }
  };

  const handleCostumeSelect = (costumeId) => {
    setSelectedCostumeId(costumeId);
  };

  const handleGenderSelect = (gender) => {
    if (!genderAvailability[gender]) {
      setGenderWarning(
        `Costume untuk gender ${
          gender === "male" ? "Male" : "Female"
        } tidak tersedia saat ini.`
      );
      return;
    }

    setGenderWarning("");
    setFormData((prev) => ({ ...prev, gender }));
  };

  const handleGalleryFileChange = async (event) => {
    try {
      const file = event.target.files?.[0];
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

      await processPendingCapture({
        image: dataUrl,
        source: "gallery",
        fileName: file.name,
      });
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

  const processPendingCapture = async (options = {}) => {
    const image = options.image ?? pendingCapture;
    const source = options.source ?? captureSource;
    const fileName = options.fileName ?? selectedFileName;

    if (!image || isBusy || captureSubmitting) return;

    try {
      setError("");
      setCaptureError("");
      setCaptureResultStatus("");
      setCaptureResultTitle("");
      setCaptureResultSub("");
      setCaptureSubmitting(true);
      setShowCaptureModal(false);
      setCaptureFilename("");
      resetJobState();

      const confirmRes = await fetch(`${API_BASE_URL}/capture-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok || confirmJson?.ok === false) {
        throw new Error(
          confirmJson?.detail ||
            confirmJson?.message ||
            "Face detection failed. Please try again."
        );
      }

      const faceCount = Number(confirmJson?.face_count || 0);
      if (!confirmJson?.has_face || faceCount < 1) {
        throw new Error(
          "Wajah tidak terdeteksi. Pastikan wajah berada di dalam oval dan pencahayaan cukup."
        );
      }
      if (confirmJson?.multiple_faces || faceCount > 1) {
        throw new Error(
          "Terdeteksi lebih dari satu wajah. Pastikan hanya satu orang yang terlihat di kamera."
        );
      }

      const res = await fetch(`${API_BASE_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });

      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.detail || "Upload failed");
      }

      setCaptureFilename(json.filename);
      setCaptureSource(source);
      setSelectedFileName(fileName);
      setPendingCapture(image);
      setCaptureResultStatus("success");
      setCaptureResultTitle(
        source === "gallery"
          ? "Foto galeri berhasil diupload"
          : "Foto Berhasil Diambil"
      );
      setCaptureResultSub("Lanjutkan ke pilih seragam.");
      setShowCaptureModal(true);
    } catch (e) {
      console.error(e);
      const message = e?.message || String(e);
      setError(message);
      setCaptureError(message);
      setCaptureSource(source);
      setSelectedFileName(fileName);
      setPendingCapture(image);
      setCaptureResultStatus("error");
      setCaptureResultTitle("Capture gagal");
      setCaptureResultSub("Detail error dari backend ditampilkan di bawah.");
      setShowCaptureModal(true);
      setStatus("Error");
      setJobStage("error");
    } finally {
      setCaptureSubmitting(false);
      setIsBusy(false);
      setTimeout(() => {
        setStatus((current) => (current === "Error" ? current : "Camera ready"));
      }, 1200);
    }
  };

  const uploadCaptureImage = async (image) => {
    const res = await fetch(`${API_BASE_URL}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });

    const json = await res.json();
    if (!res.ok || json.ok === false) {
      throw new Error(json.detail || "Upload failed");
    }

    return String(json.filename || "");
  };

  const handleCaptureResultContinue = () => {
    if (captureResultStatus !== "success" || !captureFilename) return;
    setShowCaptureModal(false);
    setPage("costume");
  };

  const handleStartProcessing = async () => {
    if (!captureFilename || !selectedCostumeId || isJobLocked) return;

    try {
      let filename = captureFilename;
      const costumeId = selectedCostumeId;
      setError("");
      try {
        await startSwapJob(filename, costumeId);
      } catch (startError) {
        const startMessage = startError?.message || String(startError);
        const missingCapture =
          /capture file not found/i.test(startMessage) ||
          /file not found/i.test(startMessage);

        if (!missingCapture || !pendingCapture) {
          throw startError;
        }

        filename = await uploadCaptureImage(pendingCapture);
        if (!filename) {
          throw startError;
        }

        setCaptureFilename(filename);
        await startSwapJob(filename, costumeId);
      }

      resetFlow();
    } catch (e) {
      console.error(e);
      const message = e?.message || String(e);
      setError(message);
      setStatus("Error");
      setPage("costume");
    }
  };

  const handleConcernContinue = () => {
    setPage("gender");
  };

  const handleGenderContinue = () => {
    setGenderTouched(true);
    if (!formData.gender) return;
    setPage("capture");
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
          <div className="welcomeTitle">
            <p className="welcomeEyebrow">Selamat Datang di</p>
            <h1 className="welcomeHeadline">Seragam BCA AI Video Generator</h1>
            <p className="welcomeLocation">Galeri BCA Sentul</p>
          </div>
          <button
            type="button"
            className="welcomeButton"
            onClick={() => setPage("concern")}
          >
            <span>Get Started</span>
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      </div>
    );
  }

  if (page === "concern") {
    return (
      <div className="stagePage">
        <div className="stageGlow stageGlowA" />
        <div className="stageGlow stageGlowB" />
        {/* <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div> */}
        <div className="stageCard concernCard">
          <div className="concernAvatar">
            <div className="concernAvatarRing">
              <img className="concernAvatarImage" src={aiFace} alt="AI assistant" />
            </div>
          </div>
          <div className="stageStep">Notice</div>
          <div className="stageTitle">Pemberitahuan Penggunaan Data</div>
          {/* <div className="stageSub">
            Halaman ini merupakan pemberitahuan penggunaan foto untuk proses AI
            face swap. Dasar pemrosesan dilakukan berdasarkan kepentingan yang
            sah (legitimate interest), bukan persetujuan.
          </div> */}
          <div className="consentCard">
            <span className="consentCopy">
              Dengan menekan tombol dibawah ini, Anda setuju bahwa BCA akan memproses data pribadi Anda berupa foto diri Anda untuk keperluan memproses dan menampilkan  foto Anda menggunakan seragam BCA menggunakan artificial intelligence (AI) pada mesin ini. BCA tidak akan menyimpan maupun memberikan foto diri Anda kepada pihak lain. Seluruh pemrosesan dilakukan sesuai dengan Kebijakan Pelindungan Data Pribadi BCA dan peraturan perundang-undangan yang berlaku.
            </span>
          </div>
          <div className="concernActions">
            <button
              type="button"
              className="stagePrimaryButton concernPrimaryButton"
              onClick={handleConcernContinue}
            >
              Setuju
            </button>
          </div>
          {/* <button
            type="button"
            className="concernBackLink"
            onClick={() => setPage("welcome")}
          >
            Kembali ke halaman awal
          </button> */}
        </div>
      </div>
    );
  }

  if (page === "gender") {
    return (
      <div className="stagePage">
        <div className="stageGlow stageGlowA" />
        <div className="stageGlow stageGlowB" />
        {/* <div className="welcomeBrand">
          <img
            className="welcomeBrandLogo"
            src="/src/assets/BCA_white.png"
            alt="BCA"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = logoBcaFallback;
            }}
          />
        </div> */}
        <div className="stageCard">
          <div className="stageStep">Step 1</div>
          <div className="stageTitle"> Pilih Gender Untuk memulai permainan</div>
          {/* <div className="stageSub">
            Pilih gender terlebih dahulu untuk menampilkan pilihan seragam yang
            sesuai.
          </div> */}
          <div className="genderChoiceGrid">
            <button
              type="button"
              className={`genderChoiceCard ${
                formData.gender === "male" ? "isActive" : ""
              }`}
              onClick={() => handleGenderSelect("male")}
              disabled={costumesLoading || !genderAvailability.male}
            >
              <span className="genderBadge maleBadge">
                <img className="genderBadgeIcon" src={manIcon} alt="Male" />
              </span>
              <span className="genderChoiceLabel">Male</span>
              {!costumesLoading && !genderAvailability.male ? (
                <span className="genderChoiceHint">Costume belum tersedia</span>
              ) : null}
            </button>
            <button
              type="button"
              className={`genderChoiceCard ${
                formData.gender === "female" ? "isActive" : ""
              }`}
              onClick={() => handleGenderSelect("female")}
              disabled={costumesLoading || !genderAvailability.female}
            >
              <span className="genderBadge femaleBadge">
                <img className="genderBadgeIcon" src={womanIcon} alt="Female" />
              </span>
              <span className="genderChoiceLabel">Female</span>
              {!costumesLoading && !genderAvailability.female ? (
                <span className="genderChoiceHint">Costume belum tersedia</span>
              ) : null}
            </button>
          </div>
          {costumesLoading ? (
            <div className="stageInfo">Sedang cek ketersediaan costume...</div>
          ) : null}
          {!costumesLoading &&
          !genderAvailability.male &&
          !genderAvailability.female ? (
            <div className="stageError">
              Belum ada data costume aktif. Silakan tambahkan costume terlebih dahulu.
            </div>
          ) : null}
          {genderWarning ? <div className="stageError">{genderWarning}</div> : null}
          {showGenderError ? (
            <div className="stageError">Pilih gender dulu sebelum lanjut.</div>
          ) : null}
          <div className="stageActions">
            <button
              type="button"
              className="stageGhostButton"
              onClick={() => setPage("welcome")}
            >
              Kembali
            </button>
            <button
              type="button"
              className="stagePrimaryButton"
              onClick={handleGenderContinue}
            >
              Lanjut
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "costume") {
    return (
      <div className="costumePage">
        <div className="costumeCard">
          <div className="costumeStep">Step 3</div>
          <h2 className="costumeTitle">Pilih Seragammu</h2>
          <div className="costumeMeta">
            Menampilkan {visibleCostumes.length} dari {costumeOptions.length} seragam
            untuk gender {selectedGenderLabel || "-"}.
          </div>

          {captureFilename ? (
            <div className="costumeCaptureNotice">
              Foto sudah tersimpan. Kamu bisa kembali bila ingin ambil ulang.
            </div>
          ) : null}

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
              Belum ada costume aktif untuk gender {formData.gender || "-"}.
            </div>
          )}

          {costumeOptions.length > COSTUMES_PER_PAGE ? (
            <div className="costumePager">
              Page {costumePageIndex + 1} of {totalCostumePages}
            </div>
          ) : null}

          {error ? <div className="costumeInlineError">{error}</div> : null}
          {jobLockMessage ? <div className="costumeInlineError">{jobLockMessage}</div> : null}

          <div className="costumeActionsRow">
            <button
              type="button"
              className="costumeBack"
              onClick={() => setPage("capture")}
            >
              Kembali
            </button>
            <button
              type="button"
              className="costumeNext"
              onClick={handleStartProcessing}
              disabled={!selectedCostumeId || !captureFilename || isJobLocked}
            >
              Lanjutkan Proses
            </button>
          </div>
        </div>
      </div>
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
      <button
        className="captureBackArrow"
        type="button"
        aria-label="Kembali"
        onClick={() => setPage("gender")}
      >
        &#8592;
      </button>
      <div className="stageStep2">Step 2</div>
      <div className="captureHeader">Ambil Foto Anda</div>
      <div className="captureGreeting">
        <div className="captureGuide">Posisikan wajah anda dalam lingkaran oval</div>
      </div>

      <div className="captureBody">
        <div className="frameWrap">
          <div ref={frameShellRef} className="frameShell">
            <video ref={videoRef} className="frameVideo" playsInline muted />
            <div ref={faceOvalRef} className="faceOval" />
          </div>
        </div>
      </div>

      <div className="captureActions">
        <button
          className="actionMain"
          type="button"
          onClick={captureOnly}
          disabled={isBusy || countdown > 0}
        >
          {isBusy || countdown > 0 ? "Tunggu..." : "Ambil Foto"}
        </button>
      </div>

      <div className="captureStatus">
        <span className={`pill ${error ? "pillRed" : "pillGreen"}`}>
          {error ? "ERROR" : "READY"}
        </span>
        <span className="statusText">{status}</span>
      </div>

      {showCaptureModal ? (
        <div className="modalOverlay">
          <div
            className={`modalCard ${
              captureResultStatus === "error" ? "modalCardError" : ""
            }`}
          >
            <div className="modalTitle">{captureResultTitle}</div>
            <div className="modalSub">{captureResultSub}</div>
            {captureSource === "gallery" && selectedFileName ? (
              <div className="modalMeta">{selectedFileName}</div>
            ) : null}
            {captureError ? <div className="modalError">{captureError}</div> : null}
            {lastShot ? (
              <img className="modalPreview" src={lastShot} alt="preview" />
            ) : null}
            <div className="modalActions">
              <button
                className="btn ghost"
                onClick={resetCaptureModal}
                disabled={captureSubmitting}
              >
                Ulangi
              </button>
              {captureResultStatus === "success" ? (
                <button
                  className="btn primary"
                  onClick={handleCaptureResultContinue}
                  disabled={captureSubmitting}
                >
                  Lanjutkan
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {captureSubmitting ? (
        <div className="modalOverlay">
          <div className="modalCard modalLoadingCard">
            <div className="modalSpinner" />
            <div className="modalTitle">Memproses capture...</div>
            <div className="modalSub">
              Tunggu sebentar, sistem sedang cek wajah dan upload foto.
            </div>
            {lastShot ? (
              <img className="modalPreview" src={lastShot} alt="preview" />
            ) : null}
          </div>
        </div>
      ) : null}

      {(isBusy || countdown > 0) && (
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
    </div>
  );
}
