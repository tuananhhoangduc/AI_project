const state = {
  paletteSize: 8,
  lastSelected: null,
  selected: null,
  sampleCanvas: null,
  sampleCtx: null,
  magnifierCanvas: null,
  magnifierCtx: null,
  previewImg: null,
  lastHoverAt: 0,
  magnifierRadius: 52,
  magnifierZoom: 8,
  lastPoint: null,
};

const HOVER_CLASSIFY_INTERVAL = 200;
const MAGNIFIER_MIN_RADIUS = 32;
const MAGNIFIER_MAX_RADIUS = 120;
const MAGNIFIER_MIN_ZOOM = 4;
const MAGNIFIER_MAX_ZOOM = 14;
const MAGNIFIER_CORNER_RADIUS = 12;
const MAGNIFIER_BORDER = "rgba(255, 255, 255, 0.9)";
const MAGNIFIER_GRID = "rgba(15, 23, 42, 0.18)";
const MAGNIFIER_SHADOW = "rgba(15, 23, 42, 0.25)";
const MAGNIFIER_HAIR = "#ef4444";
const MAGNIFIER_SHAPE = "circle";

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function rgb2hex(r, g, b) {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function hex2rgb(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function rgb2hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function quantize(value, step) {
  return Math.min(255, Math.max(0, Math.round(value / step) * step));
}

function buildPalette(img, maxColors) {
  const canvas = document.createElement("canvas");
  const target = 320;
  const scale = Math.min(1, target / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const counts = new Map();
  const step = 16;
  const stride = 4 * 4;

  for (let i = 0; i < data.length; i += stride) {
    const r = quantize(data[i], step);
    const g = quantize(data[i + 1], step);
    const b = quantize(data[i + 2], step);
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([key]) => key.split(",").map((v) => Number(v)));
}

function renderPalette(colors) {
  const wrap = document.getElementById("paletteSwatches");
  wrap.innerHTML = "";
  if (!colors.length) {
    wrap.innerHTML =
      '<span class="placeholder">Pick an image to generate palette</span>';
    return;
  }
  colors.forEach(([r, g, b], index) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = rgb2hex(r, g, b);
    swatch.title = `RGB(${r}, ${g}, ${b})`;
    swatch.addEventListener("click", () => selectColor([r, g, b], index));
    wrap.appendChild(swatch);
  });
}

function setDetailValues(rgb) {
  const [r, g, b] = rgb;
  const hex = rgb2hex(r, g, b);
  const [h, s, l] = rgb2hsl(r, g, b);
  document.getElementById("hexValue").value = hex;
  document.getElementById("rgbValue").value = `rgb(${r}, ${g}, ${b})`;
  document.getElementById("hslValue").value = `${h}, ${s}%, ${l}%`;
  return { hex, h, s, l };
}

function updateSwatches(current) {
  const primary = document.getElementById("primarySwatch");
  const secondary = document.getElementById("secondarySwatch");
  primary.style.backgroundColor = rgb2hex(...current);
  if (state.lastSelected) {
    secondary.style.backgroundColor = rgb2hex(...state.lastSelected);
  }
}

function updatePrimarySwatch(current) {
  const primary = document.getElementById("primarySwatch");
  primary.style.backgroundColor = rgb2hex(...current);
}

async function classifyColor(rgb) {
  const resultArea = document.getElementById("resultArea");
  resultArea.innerHTML = '<span class="placeholder">Predicting...</span>';
  try {
    const result = await jsonFetch("/api/predict/all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rgb }),
    });
    if (!result || !result.predictions) {
      resultArea.innerHTML = `<div class="error">${JSON.stringify(result)}</div>`;
      return;
    }
    const rows = Object.entries(result.predictions)
      .map(
        ([metric, label]) =>
          `<div class="prediction-row"><span>${metric}</span><strong>${label}</strong></div>`,
      )
      .join("");
    resultArea.innerHTML = `
      <div class="prediction-list">
        ${rows}
      </div>
      <div class="recommended">Recommended: <strong>${result.recommended_prediction}</strong> (${result.recommended_metric})</div>
    `;
  } catch (e) {
    resultArea.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function selectColor(rgb) {
  state.lastSelected = state.selected;
  state.selected = rgb;
  updateSwatches(rgb);
  setDetailValues(rgb);
  classifyColor(rgb);
}

function showImage(img) {
  const preview = document.getElementById("previewImg");
  preview.onload = () => setupMagnifier(preview);
  preview.src = img.src;
  document.getElementById("imagePreview").classList.remove("hidden");
  document.getElementById("uploadZone").classList.add("hidden");
}

function setupMagnifier(img) {
  const magnifier = document.getElementById("magnifierCanvas");
  if (!magnifier) {
    return;
  }

  state.previewImg = img;
  state.magnifierCanvas = magnifier;
  state.magnifierCtx = magnifier.getContext("2d");

  refreshSampleCanvas(img);
  resizeMagnifier();
  magnifier.classList.remove("hidden");

  img.addEventListener("mousemove", handleMagnifierMove);
  img.addEventListener("mouseleave", handleMagnifierLeave);
  img.addEventListener("click", handleMagnifierClick);
  img.addEventListener("wheel", handleMagnifierWheel, { passive: false });
}

function refreshSampleCanvas(img) {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = img.naturalWidth || img.width;
  sampleCanvas.height = img.naturalHeight || img.height;
  const sampleCtx = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  sampleCtx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
  state.sampleCanvas = sampleCanvas;
  state.sampleCtx = sampleCtx;
}

function resizeMagnifier() {
  if (!state.previewImg || !state.magnifierCanvas) {
    return;
  }
  const rect = state.previewImg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  state.magnifierCanvas.width = Math.round(rect.width);
  state.magnifierCanvas.height = Math.round(rect.height);
}

function getImagePoint(event) {
  if (!state.sampleCtx) {
    return null;
  }
  const rect = event.target.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  return {
    cx: event.clientX - rect.left,
    cy: event.clientY - rect.top,
    x: Math.min(
      state.sampleCanvas.width - 1,
      Math.max(0, x * state.sampleCanvas.width),
    ),
    y: Math.min(
      state.sampleCanvas.height - 1,
      Math.max(0, y * state.sampleCanvas.height),
    ),
  };
}

function sampleRgb(x, y) {
  const pixel = state.sampleCtx.getImageData(
    Math.floor(x),
    Math.floor(y),
    1,
    1,
  ).data;
  return [pixel[0], pixel[1], pixel[2]];
}

function handleMagnifierMove(event) {
  if (!state.magnifierCtx || !state.sampleCtx) {
    return;
  }
  const point = getImagePoint(event);
  if (!point) {
    return;
  }
  state.lastPoint = point;
  const { cx, cy, x, y } = point;
  const ctx = state.magnifierCtx;
  const radius = state.magnifierRadius;
  const zoom = state.magnifierZoom;
  const rawSize = (radius * 2) / zoom;
  const srcSize = Math.max(1, Math.round(rawSize));
  const sx = Math.min(
    state.sampleCanvas.width - srcSize,
    Math.max(0, Math.round(x - srcSize / 2)),
  );
  const sy = Math.min(
    state.sampleCanvas.height - srcSize,
    Math.max(0, Math.round(y - srcSize / 2)),
  );

  ctx.clearRect(
    0,
    0,
    state.magnifierCanvas.width,
    state.magnifierCanvas.height,
  );
  ctx.save();
  drawMagnifierShape(ctx, cx, cy, radius);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    state.sampleCanvas,
    sx,
    sy,
    srcSize,
    srcSize,
    cx - radius,
    cy - radius,
    radius * 2,
    radius * 2,
  );
  drawMagnifierGrid(ctx, cx, cy, radius, zoom);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = MAGNIFIER_SHADOW;
  ctx.shadowBlur = 8;
  drawMagnifierShape(ctx, cx, cy, radius);
  ctx.strokeStyle = MAGNIFIER_BORDER;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const boxSize = Math.max(10, Math.round(zoom * 1.2));
  ctx.strokeStyle = MAGNIFIER_HAIR;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.round(cx - boxSize / 2),
    Math.round(cy - boxSize / 2),
    boxSize,
    boxSize,
  );

  ctx.beginPath();
  ctx.moveTo(cx - boxSize * 0.9, cy);
  ctx.lineTo(cx + boxSize * 0.9, cy);
  ctx.moveTo(cx, cy - boxSize * 0.9);
  ctx.lineTo(cx, cy + boxSize * 0.9);
  ctx.strokeStyle = MAGNIFIER_HAIR;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rgb = sampleRgb(x, y);
  updatePrimarySwatch(rgb);
  setDetailValues(rgb);
  const now = performance.now();
  if (now - state.lastHoverAt > HOVER_CLASSIFY_INTERVAL) {
    state.lastHoverAt = now;
    classifyColor(rgb);
  }
}

function handleMagnifierLeave() {
  if (state.magnifierCtx && state.magnifierCanvas) {
    state.magnifierCtx.clearRect(
      0,
      0,
      state.magnifierCanvas.width,
      state.magnifierCanvas.height,
    );
  }
}

function handleMagnifierClick(event) {
  if (!state.sampleCtx) {
    return;
  }
  const point = getImagePoint(event);
  if (!point) {
    return;
  }
  selectColor(sampleRgb(point.x, point.y));
}

function handleMagnifierWheel(event) {
  if (!state.magnifierCtx) {
    return;
  }
  event.preventDefault();
  const delta = -Math.sign(event.deltaY);
  const nextZoom = state.magnifierZoom + delta;
  state.magnifierZoom = Math.min(
    MAGNIFIER_MAX_ZOOM,
    Math.max(MAGNIFIER_MIN_ZOOM, nextZoom),
  );

  if (state.lastPoint) {
    handleMagnifierMove({
      target: event.target,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawMagnifierGrid(ctx, cx, cy, radius, zoom) {
  if (zoom < 4) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = MAGNIFIER_GRID;
  ctx.lineWidth = 1;
  const cell = zoom;
  const size = radius * 2;
  const start = -Math.floor(size / 2 / cell) * cell;
  for (let x = start; x <= size / 2; x += cell) {
    ctx.beginPath();
    ctx.moveTo(cx + x, cy - radius);
    ctx.lineTo(cx + x, cy + radius);
    ctx.stroke();
  }
  for (let y = start; y <= size / 2; y += cell) {
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy + y);
    ctx.lineTo(cx + radius, cy + y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMagnifierShape(ctx, cx, cy, radius) {
  if (MAGNIFIER_SHAPE === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    return;
  }
  drawRoundedRect(
    ctx,
    cx - radius,
    cy - radius,
    radius * 2,
    radius * 2,
    MAGNIFIER_CORNER_RADIUS,
  );
}

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      showImage(img);
      const palette = buildPalette(img, state.paletteSize);
      renderPalette(palette);
      if (palette.length) {
        selectColor(palette[0]);
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

const imageInput = document.getElementById("imageInput");
imageInput.addEventListener("change", (event) => {
  if (event.target.files.length) {
    handleImageFile(event.target.files[0]);
  }
});

document.getElementById("pickFileBtn").addEventListener("click", () => {
  imageInput.click();
});

document.getElementById("useImageBtn").addEventListener("click", () => {
  imageInput.click();
});

const uploadZone = document.getElementById("uploadZone");
uploadZone.addEventListener("click", () => imageInput.click());
uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadZone.classList.add("dragover");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});
uploadZone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadZone.classList.remove("dragover");
  if (event.dataTransfer.files.length) {
    handleImageFile(event.dataTransfer.files[0]);
  }
});

document.getElementById("paletteMinus").addEventListener("click", () => {
  state.paletteSize = Math.max(4, state.paletteSize - 1);
  if (state.selected) {
    const preview = document.getElementById("previewImg");
    const img = new Image();
    img.onload = () => {
      const palette = buildPalette(img, state.paletteSize);
      renderPalette(palette);
    };
    img.src = preview.src;
  }
});

document.getElementById("palettePlus").addEventListener("click", () => {
  state.paletteSize = Math.min(16, state.paletteSize + 1);
  if (state.selected) {
    const preview = document.getElementById("previewImg");
    const img = new Image();
    img.onload = () => {
      const palette = buildPalette(img, state.paletteSize);
      renderPalette(palette);
    };
    img.src = preview.src;
  }
});

document.getElementById("eyeDropperBtn").addEventListener("click", async () => {
  if (!window.EyeDropper) {
    alert("EyeDropper is not supported in this browser.");
    return;
  }
  const eyeDropper = new window.EyeDropper();
  try {
    const result = await eyeDropper.open();
    const rgb = hex2rgb(result.sRGBHex);
    selectColor(rgb);
  } catch {
    // user cancelled
  }
});

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const targetId = btn.getAttribute("data-copy");
    const input = document.getElementById(targetId);
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    } catch {
      input.select();
      document.execCommand("copy");
    }
  });
});

window.addEventListener("resize", () => {
  resizeMagnifier();
});
