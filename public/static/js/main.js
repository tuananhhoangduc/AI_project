import { jsonFetch, postJson } from "./api.js";
import { $, escapeHtml, hide, show } from "./dom.js";
import { deltaE76, describeDeltaE, hex2rgb, rgb2hex, rgb2hsl } from "./color.js";
import { buildPalette, exportPaletteCss, exportPaletteJson } from "./palette.js";
import { generateHarmonies } from "./harmony.js";
import { setupWebcamPicker } from "./webcam.js";

const state = {
  paletteSize: 8,
  palette: [],
  selected: null,
  previous: null,
  imageSrc: null,
  scanHistory: [],
};

function setDetailValues(rgb) {
  const [r, g, b] = rgb;
  const hex = rgb2hex(r, g, b);
  const [h, s, l] = rgb2hsl(r, g, b);

  $("#hexValue").value = hex;
  $("#rgbValue").value = `rgb(${r}, ${g}, ${b})`;
  $("#hslValue").value = `${h}, ${s}%, ${l}%`;
}

function updateSwatches(current) {
  $("#primarySwatch").style.backgroundColor = rgb2hex(...current);
  $("#secondarySwatch").style.backgroundColor = state.previous
    ? rgb2hex(...state.previous)
    : "#f1f5f9";
}

async function classifyColor(rgb) {
  const resultArea = $("#resultArea");
  resultArea.innerHTML = '<span class="placeholder">Predicting...</span>';

  try {
    const result = await postJson("/api/predict/all", { rgb });

    const rows = Object.entries(result.predictions)
      .map(
        ([metric, label]) =>
          `<div class="prediction-row"><span>${escapeHtml(metric)}</span><strong>${escapeHtml(label)}</strong></div>`,
      )
      .join("");

    resultArea.innerHTML = `
      <div class="prediction-list">${rows}</div>
      <div class="recommended">
        Recommended: <strong>${escapeHtml(result.recommended_prediction)}</strong>
        (${escapeHtml(result.recommended_metric)})
      </div>
    `;

    return result;
  } catch (error) {
    resultArea.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    return null;
  }
}

function renderDeltaE() {
  const wrap = $("#deltaResult");

  if (!state.selected || !state.previous) {
    wrap.innerHTML = '<span class="placeholder">Select two colors first</span>';
    return;
  }

  const delta = deltaE76(state.selected, state.previous);
  wrap.innerHTML = `
    <div class="delta-value">ΔE76 = ${delta.toFixed(2)}</div>
    <div class="muted">${escapeHtml(describeDeltaE(delta))}</div>
  `;
}

function renderHarmonies(rgb) {
  const wrap = $("#harmonyResult");
  const groups = generateHarmonies(rgb);

  wrap.innerHTML = groups
    .map(
      (group) => `
        <div class="harmony-group">
          <div class="harmony-name">${escapeHtml(group.name)}</div>
          <div class="harmony-colors">
            ${group.colors
              .map(
                (color) => `
                  <button
                    class="harmony-color"
                    type="button"
                    data-rgb="${color.rgb.join(",")}"
                    style="background:${color.hex}"
                    title="${color.hex}"
                  >
                    <span>${color.hex}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      `,
    )
    .join("");

  wrap.querySelectorAll("[data-rgb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectColor(btn.dataset.rgb.split(",").map(Number));
    });
  });
}

function renderWebcamCurrent(result) {
  const swatch = $("#webcamCurrentSwatch");
  const label = $("#webcamCurrentLabel");
  const hex = $("#webcamCurrentHex");
  const rgb = $("#webcamCurrentRgb");
  const time = $("#webcamCurrentTime");

  if (!result) return;

  swatch.style.background = result.hex;
  label.textContent = result.recommended_prediction || "-";
  hex.textContent = result.hex || "-";
  rgb.textContent = `rgb(${result.rgb.join(", ")})`;
  time.textContent = new Date().toLocaleTimeString("vi-VN");
}

function renderScanHistory() {
  const wrap = $("#scanHistory");

  if (!wrap) return;

  if (!state.scanHistory.length) {
    wrap.innerHTML = '<span class="placeholder">No scan results yet</span>';
    return;
  }

  wrap.innerHTML = state.scanHistory
    .map(
      (item) => `
        <div class="scan-history-item">
          <div class="scan-history-left">
            ${
              item.snapshot
                ? `<img class="scan-history-thumb" src="${item.snapshot}" alt="scan frame" />`
                : ""
            }
            <div class="scan-history-swatch" style="background:${item.hex}"></div>
            <div class="scan-history-meta">
              <div class="scan-history-label">${escapeHtml(item.label)}</div>
              <div class="scan-history-code">${escapeHtml(item.hex)} • rgb(${item.rgb.join(", ")})</div>
            </div>
          </div>
          <div class="scan-history-time">${escapeHtml(item.time)}</div>
        </div>
      `,
    )
    .join("");
}

function pushScanHistory(result, meta = {}) {
  if (!result) return;

  const item = {
  hex: result.hex,
  rgb: result.rgb,
  label: result.recommended_prediction || "unknown",
  metric: result.recommended_metric || "-",
  time: meta.scannedAt || new Date().toLocaleTimeString("vi-VN"),
  snapshot: meta.snapshot || null,
  distance: typeof meta.distance === "number" ? meta.distance : null,
};

  const latest = state.scanHistory[0];

  // nếu quét liên tiếp ra đúng cùng màu thì khỏi lưu trùng
  if (latest && latest.hex === item.hex && latest.label === item.label) {
    return;
  }

  state.scanHistory.unshift(item);

  if (state.scanHistory.length > 12) {
    state.scanHistory = state.scanHistory.slice(0, 12);
  }

  renderScanHistory();
}

async function selectColor(rgb, options = {}) {
  state.previous = state.selected;
  state.selected = rgb;

  updateSwatches(rgb);
  setDetailValues(rgb);
  renderDeltaE();
  renderHarmonies(rgb);

  const result = await classifyColor(rgb);

  if (options.source === "webcam" && result) {
    renderWebcamCurrent(result);
    pushScanHistory(result);
  }

  return result;
}

function renderPalette(palette) {
  const wrap = $("#paletteSwatches");
  const bar = $("#paletteBar");

  wrap.innerHTML = "";
  bar.innerHTML = "";

  if (!palette.length) {
    wrap.innerHTML = '<span class="placeholder">Pick an image to generate palette</span>';
    hide("#paletteBar");
    return;
  }

  palette.forEach((color, index) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = color.hex;
    swatch.title = `${color.hex} - ${color.percentage}%`;
    swatch.innerHTML = `<span>${color.percentage}%</span>`;
    swatch.addEventListener("click", () => selectColor(color.rgb));
    wrap.appendChild(swatch);

    const piece = document.createElement("div");
    piece.className = "palette-bar-piece";
    piece.style.backgroundColor = color.hex;
    piece.style.width = `${Math.max(color.percentage, 2)}%`;
    piece.title = `${index + 1}. ${color.hex} - ${color.percentage}%`;
    bar.appendChild(piece);
  });

  show("#paletteBar");
}

function showImage(img) {
  $("#previewImg").src = img.src;
  state.imageSrc = img.src;
  show("#imagePreview");
  hide("#uploadZone");
}

function regeneratePalette() {
  if (!state.imageSrc) return;

  const img = new Image();
  img.onload = () => {
    state.palette = buildPalette(img, state.paletteSize);
    renderPalette(state.palette);
  };
  img.src = state.imageSrc;
}

function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      showImage(img);
      state.palette = buildPalette(img, state.paletteSize);
      renderPalette(state.palette);
      if (state.palette.length) selectColor(state.palette[0].rgb);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function loadNeighbors() {
  const plot = $("#knnPlot");

  if (!state.selected) {
    plot.innerHTML = '<span class="placeholder">Select a color first.</span>';
    return;
  }

  plot.innerHTML = '<span class="placeholder">Loading nearest neighbors...</span>';

  try {
    const result = await postJson("/api/predict/neighbors", {
      rgb: state.selected,
      k: 8,
    });

    renderKnnPlot(result);
  } catch (error) {
    plot.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function renderKnnPlot(result) {
  const query = result.query.rgb;
  const neighbors = result.neighbors;

  const neighborTrace = {
    x: neighbors.map((item) => item.rgb[0]),
    y: neighbors.map((item) => item.rgb[1]),
    z: neighbors.map((item) => item.rgb[2]),
    mode: "markers+text",
    type: "scatter3d",
    text: neighbors.map((item) => `${item.rank}. ${item.label}`),
    marker: {
      size: 6,
      color: neighbors.map((item) => item.hex),
    },
    name: "Nearest neighbors",
  };

  const queryTrace = {
    x: [query[0]],
    y: [query[1]],
    z: [query[2]],
    mode: "markers+text",
    type: "scatter3d",
    text: ["Selected color"],
    marker: {
      size: 9,
      color: [result.query.hex],
      symbol: "diamond",
    },
    name: "Selected",
  };

  Plotly.newPlot(
    "knnPlot",
    [neighborTrace, queryTrace],
    {
      margin: { l: 0, r: 0, b: 0, t: 16 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      scene: {
        xaxis: { title: "Red", range: [0, 255] },
        yaxis: { title: "Green", range: [0, 255] },
        zaxis: { title: "Blue", range: [0, 255] },
      },
    },
    { responsive: true, displayModeBar: false },
  );
}

function bindEvents() {
  const imageInput = $("#imageInput");
  const uploadZone = $("#uploadZone");

  imageInput.addEventListener("change", (event) => {
    if (event.target.files.length) handleImageFile(event.target.files[0]);
  });

  $("#pickFileBtn").addEventListener("click", () => imageInput.click());
  $("#useImageBtn").addEventListener("click", () => imageInput.click());

  uploadZone.addEventListener("click", () => imageInput.click());
  uploadZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragover");
  });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
  uploadZone.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragover");
    if (event.dataTransfer.files.length) handleImageFile(event.dataTransfer.files[0]);
  });

  document.addEventListener("paste", (event) => {
    const file = Array.from(event.clipboardData?.files || []).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file) handleImageFile(file);
  });

  $("#paletteMinus").addEventListener("click", () => {
    state.paletteSize = Math.max(4, state.paletteSize - 1);
    regeneratePalette();
  });

  $("#palettePlus").addEventListener("click", () => {
    state.paletteSize = Math.min(16, state.paletteSize + 1);
    regeneratePalette();
  });

  $("#exportJsonBtn").addEventListener("click", () => {
    if (state.palette.length) exportPaletteJson(state.palette);
  });

  $("#exportCssBtn").addEventListener("click", () => {
    if (state.palette.length) exportPaletteCss(state.palette);
  });

  $("#clearScanHistoryBtn")?.addEventListener("click", () => {
  state.scanHistory = [];
  renderScanHistory();
});

  $("#eyeDropperBtn").addEventListener("click", async () => {
    if (!window.EyeDropper) {
      alert("EyeDropper is not supported in this browser.");
      return;
    }

    try {
      const result = await new window.EyeDropper().open();
      selectColor(hex2rgb(result.sRGBHex));
    } catch {
      // user cancelled
    }
  });

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const input = document.getElementById(btn.getAttribute("data-copy"));
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

  $("#loadNeighborsBtn").addEventListener("click", loadNeighbors);

  $("#btn-config").addEventListener("click", async () => {
    const result = await jsonFetch("/api/config");
    show("#utilResult");
    $("#utilOutput").textContent = JSON.stringify(result, null, 2);
  });

  $("#btn-summary").addEventListener("click", async () => {
    const result = await jsonFetch("/api/model/summary");
    show("#utilResult");
    $("#utilOutput").textContent = JSON.stringify(result, null, 2);
  });

  $("#btn-run-tests").addEventListener("click", async () => {
    show("#utilResult");
    $("#utilOutput").textContent = "Running tests...";
    const result = await jsonFetch("/api/test-cases/run");
    $("#utilOutput").textContent = JSON.stringify(result, null, 2);
  });
}

bindEvents();
renderScanHistory();

setupWebcamPicker({
  interval: 2000,
  sampleRadius: 6,
  minColorDistance: 22,
  onColorPicked: async (rgb, meta = {}) => {
    await selectColor(rgb, {
      source: "webcam",
      meta,
    });
  },
});
