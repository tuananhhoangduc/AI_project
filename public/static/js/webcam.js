import { $ } from "./dom.js";
import { rgb2hex } from "./color.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbDistance(a, b) {
  if (!a || !b) return Infinity;

  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getAverageRgb(ctx, centerX, centerY, radius, width, height) {
  const left = clamp(centerX - radius, 0, width - 1);
  const top = clamp(centerY - radius, 0, height - 1);
  const size = radius * 2 + 1;

  const sampleWidth = Math.min(size, width - left);
  const sampleHeight = Math.min(size, height - top);

  const { data } = ctx.getImageData(left, top, sampleWidth, sampleHeight);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];

    if (alpha < 20) continue;

    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }

  if (!count) return [0, 0, 0];

  return [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count),
  ];
}

function createFrameSnapshot(video) {
  const snapshotCanvas = document.createElement("canvas");
  const maxWidth = 220;
  const scale = Math.min(1, maxWidth / video.videoWidth);

  snapshotCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  snapshotCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const snapshotCtx = snapshotCanvas.getContext("2d");
  snapshotCtx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

  return snapshotCanvas.toDataURL("image/jpeg", 0.72);
}

function waitForVideoReady(video) {
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
  });
}

export function setupWebcamPicker({
  onColorPicked,
  interval = 2000,
  sampleRadius = 6,
  minColorDistance = 22,
} = {}) {
  const video = $("#webcamVideo");
  const canvas = $("#webcamCanvas");
  const startBtn = $("#startWebcamBtn");
  const stopBtn = $("#stopWebcamBtn");
  const status = $("#webcamStatus");

  if (!video || !canvas || !startBtn || !stopBtn || !status) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let stream = null;
  let timer = null;
  let isCapturing = false;
  let lastSentRgb = null;
  let totalScans = 0;
  let skippedScans = 0;

  function setStatus(message) {
    status.textContent = message;
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function captureCenterColor({ force = false } = {}) {
    if (!stream || !video.videoWidth || !video.videoHeight || isCapturing) {
      return;
    }

    // Không quét khi tab đang ẩn để đỡ tốn tài nguyên
    if (document.hidden) {
      return;
    }

    isCapturing = true;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const centerX = Math.floor(canvas.width / 2);
      const centerY = Math.floor(canvas.height / 2);

      const rgb = getAverageRgb(
        ctx,
        centerX,
        centerY,
        sampleRadius,
        canvas.width,
        canvas.height,
      );

      const hex = rgb2hex(...rgb);
      const distance = rgbDistance(rgb, lastSentRgb);
      const now = new Date().toLocaleTimeString("vi-VN");

      totalScans += 1;

      if (!force && distance < minColorDistance) {
        skippedScans += 1;
        setStatus(
          `Stable color: ${hex} • ${now} • skipped ${skippedScans}/${totalScans}`,
        );
        return;
      }

      lastSentRgb = rgb;

      setStatus(`Scanned: ${hex} • ${now} • distance ${distance.toFixed(1)}`);

      if (typeof onColorPicked === "function") {
        const snapshot = createFrameSnapshot(video);

        await onColorPicked(rgb, {
          hex,
          snapshot,
          distance,
          scannedAt: now,
          sampleRadius,
        });
      }
    } catch (error) {
      setStatus(`Scan error: ${error.message}`);
    } finally {
      isCapturing = false;
    }
  }

  async function startWebcam() {
    if (stream) return;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser does not support webcam access.");
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      video.srcObject = stream;

      await video.play();
      await waitForVideoReady(video);

      startBtn.disabled = true;
      stopBtn.disabled = false;

      totalScans = 0;
      skippedScans = 0;
      lastSentRgb = null;

      setStatus(`Camera is on • Auto scan every ${interval / 1000}s`);

      await captureCenterColor({ force: true });

      clearTimer();
      timer = window.setInterval(() => {
        captureCenterColor();
      }, interval);
    } catch (error) {
      setStatus(`Cannot open webcam: ${error.message}`);
      stopWebcam();
    }
  }

  function stopWebcam() {
    clearTimer();

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    video.srcObject = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    isCapturing = false;
    lastSentRgb = null;

    setStatus("Camera is off");
  }

  startBtn.addEventListener("click", startWebcam);
  stopBtn.addEventListener("click", stopWebcam);

  window.addEventListener("beforeunload", stopWebcam);

  document.addEventListener("visibilitychange", () => {
    if (!stream) return;

    if (document.hidden) {
      setStatus("Camera paused because tab is hidden");
    } else {
      setStatus(`Camera is on • Auto scan every ${interval / 1000}s`);
      captureCenterColor({ force: true });
    }
  });
}