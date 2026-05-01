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
            ${item.snapshot
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
    pushScanHistory(result, options.meta || {});
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

function setActiveUtilityTab(activeId) {
  ["btn-summary", "btn-config", "btn-run-tests"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle("active", id === activeId);
  });
}

function showUtilityLoading(message = "Loading...") {
  show("#utilResult");
  $("#utilOutput").innerHTML = `
    <div class="utility-loading">
      <div class="utility-spinner"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function showUtilityError(error) {
  show("#utilResult");
  $("#utilOutput").innerHTML = `
    <div class="utility-error">
      <strong>Something went wrong</strong>
      <span>${escapeHtml(error.message || String(error))}</span>
    </div>
  `;
}

function toPercent(value) {
  const number = Number(value || 0);
  return `${Math.round(number * 100)}%`;
}

function formatMetricName(metric) {
  const names = {
    euclidean: "Euclidean",
    manhattan: "Manhattan",
    chebyshev: "Chebyshev",
    minkowski_p3: "Minkowski p=3",
  };

  return names[metric] || metric;
}

function getMetricDescription(metric) {
  const descriptions = {
    euclidean: "Straight-line distance in RGB space.",
    manhattan: "Sum of absolute RGB differences.",
    chebyshev: "Largest single-channel difference.",
    minkowski_p3: "Minkowski distance with p = 3.",
  };

  return descriptions[metric] || "Distance metric used by KNN.";
}

function renderStatCards(cards) {
  return `
    <div class="utility-stat-grid">
      ${cards
      .map(
        (card) => `
            <div class="utility-stat-card">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(String(card.value))}</strong>
              ${card.description
            ? `<small>${escapeHtml(card.description)}</small>`
            : ""
          }
            </div>
          `,
      )
      .join("")}
    </div>
  `;
}

function renderLabelDistribution(labels = {}) {
  const entries = Object.entries(labels).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return `
    <div class="utility-section">
      <div class="utility-section-head">
        <h3>Dataset label distribution</h3>
        <span>${entries.length} labels</span>
      </div>

      <div class="label-bars">
        ${entries
      .map(([label, count]) => {
        const percent = Math.max(4, Math.round((count / max) * 100));
        return `
              <div class="label-bar-row">
                <div class="label-bar-info">
                  <strong>${escapeHtml(label)}</strong>
                  <span>${count} samples</span>
                </div>
                <div class="label-bar-track">
                  <div style="width:${percent}%"></div>
                </div>
              </div>
            `;
      })
      .join("")}
      </div>
    </div>
  `;
}

function renderMetricCards(results = [], recommendedMetric) {
  return `
    <div class="utility-section">
      <div class="utility-section-head">
        <h3>Metric performance</h3>
        <span>Higher is better</span>
      </div>

      <div class="metric-card-grid">
        ${results
      .map((item) => {
        const isBest = item.metric_name === recommendedMetric;
        return `
              <div class="metric-card ${isBest ? "best" : ""}">
                <div class="metric-card-top">
                  <strong>${escapeHtml(formatMetricName(item.metric_name))}</strong>
                  ${isBest ? `<span class="best-badge">Best</span>` : ""}
                </div>

                <p>${escapeHtml(getMetricDescription(item.metric_name))}</p>

                <div class="metric-score">
                  <span>Accuracy</span>
                  <strong>${toPercent(item.accuracy)}</strong>
                </div>
                <div class="metric-progress">
                  <div style="width:${Math.round(Number(item.accuracy || 0) * 100)}%"></div>
                </div>

                <div class="metric-score">
                  <span>Macro F1</span>
                  <strong>${toPercent(item.macro_f1)}</strong>
                </div>
                <div class="metric-progress secondary">
                  <div style="width:${Math.round(Number(item.macro_f1 || 0) * 100)}%"></div>
                </div>
              </div>
            `;
      })
      .join("")}
      </div>
    </div>
  `;
}

function renderSummaryDashboard(summary) {
  const dataset = summary.dataset || {};
  const config = summary.config || {};
  const best = summary.recommended_metric || {};
  const results = summary.results || [];

  show("#utilResult");

  $("#utilOutput").innerHTML = `
    ${renderStatCards([
      {
        label: "Dataset rows",
        value: dataset.rows || 0,
        description: "RGB color samples used by the model",
      },
      {
        label: "Recommended metric",
        value: formatMetricName(config.recommended_metric || best.metric_name || "-"),
        description: "Selected by accuracy and Macro F1",
      },
      {
        label: "K neighbors",
        value: config.k_neighbors || "-",
        description: "Number of nearest samples used for voting",
      },
      {
        label: "Best accuracy",
        value: best.accuracy !== undefined ? toPercent(best.accuracy) : "-",
        description: "Performance on the test split",
      },
    ])}

    ${renderMetricCards(results, config.recommended_metric || best.metric_name)}

    ${renderLabelDistribution(dataset.labels || {})}
  `;
}

function renderExperimentControls(config, notice = "") {
  const safeK = Number(config.k_neighbors || 5);
  const safeTestSize = Number(config.test_size ?? 0.2);
  const safeRandomState = Number(config.random_state ?? 42);

  return `
    <div class="utility-section experiment-section">
      <div class="utility-section-head">
        <div>
          <h3>Experiment controls</h3>
          <p class="utility-section-desc">
            Change KNN parameters, retrain the model, then compare accuracy and test results again.
          </p>
        </div>
        <span>Live retrain</span>
      </div>

      ${notice ? `<div class="experiment-notice">${escapeHtml(notice)}</div>` : ""}

      <form id="retrainForm" class="experiment-form">
        <label class="experiment-field">
          <span>K neighbors</span>
          <input
            id="expKNeighbors"
            type="number"
            min="1"
            max="50"
            step="1"
            value="${safeK}"
          />
          <small>Lower K is more sensitive. Higher K is more stable.</small>
        </label>

        <label class="experiment-field">
          <span>Test size</span>
          <select id="expTestSize">
            ${[0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]
              .map(
                (value) => `
                  <option value="${value}" ${Math.abs(value - safeTestSize) < 0.0001 ? "selected" : ""}>
                    ${Math.round(value * 100)}% test / ${Math.round((1 - value) * 100)}% train
                  </option>
                `,
              )
              .join("")}
          </select>
          <small>Controls how much data is reserved for evaluation.</small>
        </label>

        <label class="experiment-field">
          <span>Random state</span>
          <input
            id="expRandomState"
            type="number"
            min="0"
            step="1"
            value="${safeRandomState}"
          />
          <small>Same seed gives reproducible train/test split.</small>
        </label>

        <div class="experiment-actions">
          <button id="retrainModelBtn" class="primary-btn" type="submit">
            Retrain model
          </button>
          <button id="resetExperimentBtn" class="secondary-btn" type="button">
            Reset default
          </button>
        </div>
      </form>

      <div id="retrainStatus" class="experiment-status muted">
        Current setup: K=${safeK}, test size=${Math.round(safeTestSize * 100)}%, seed=${safeRandomState}.
      </div>
    </div>
  `;
}

function readExperimentPayload() {
  const k = Number($("#expKNeighbors")?.value || 5);
  const testSize = Number($("#expTestSize")?.value || 0.2);
  const randomState = Number($("#expRandomState")?.value || 42);

  if (!Number.isInteger(k) || k < 1 || k > 50) {
    throw new Error("K neighbors must be an integer from 1 to 50.");
  }

  if (!Number.isFinite(testSize) || testSize <= 0 || testSize >= 0.5) {
    throw new Error("Test size must be greater than 0 and less than 50%.");
  }

  if (!Number.isInteger(randomState) || randomState < 0) {
    throw new Error("Random state must be a non-negative integer.");
  }

  return {
    k_neighbors: k,
    test_size: testSize,
    random_state: randomState,
  };
}

function extractApiData(payload) {
  return payload && payload.data ? payload.data : payload;
}

function setRetrainStatus(message, type = "info") {
  const status = document.getElementById("retrainStatus");
  if (!status) return;
  status.className = `experiment-status ${type}`;
  status.textContent = message;
}

function bindRetrainControls() {
  const form = document.getElementById("retrainForm");
  const resetBtn = document.getElementById("resetExperimentBtn");
  const submitBtn = document.getElementById("retrainModelBtn");

  if (!form || !submitBtn) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const payload = readExperimentPayload();
      submitBtn.disabled = true;
      submitBtn.textContent = "Retraining...";
      setRetrainStatus("Retraining model with new KNN parameters...", "info");

      const response = await postJson("/api/model/retrain", payload);
      const data = extractApiData(response);
      const nextConfig = data.config || (await jsonFetch("/api/config"));
      const summary = data.summary || null;

      renderConfigDashboard(
        nextConfig,
        `Model retrained successfully: K=${nextConfig.k_neighbors}, test size=${Math.round(nextConfig.test_size * 100)}%, seed=${nextConfig.random_state}.`,
      );

      if (summary) {
        state.latestModelSummary = summary;
      }

      if (state.selected) {
        await classifyColor(state.selected);
      }
    } catch (error) {
      setRetrainStatus(error.message || String(error), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Retrain model";
    }
  });

  resetBtn?.addEventListener("click", () => {
    $("#expKNeighbors").value = 5;
    $("#expTestSize").value = 0.2;
    $("#expRandomState").value = 42;
    setRetrainStatus("Default values restored. Click Retrain model to apply them.", "info");
  });
}

function renderConfigDashboard(config, notice = "") {
  show("#utilResult");

  const metrics = config.metrics || [];

  $("#utilOutput").innerHTML = `
    ${renderStatCards([
    {
      label: "K neighbors",
      value: config.k_neighbors || "-",
      description: "The model votes from K nearest colors",
    },
    {
      label: "Test size",
      value: config.test_size !== undefined ? `${Math.round(config.test_size * 100)}%` : "-",
      description: "Dataset proportion used for evaluation",
    },
    {
      label: "Random state",
      value: config.random_state ?? "-",
      description: "Keeps train/test split reproducible",
    },
    {
      label: "Recommended",
      value: formatMetricName(config.recommended_metric || "-"),
      description: "Default metric used for predictions",
    },
  ])}

    ${renderExperimentControls(config, notice)}

    <div class="utility-section">
      <div class="utility-section-head">
        <h3>Available distance metrics</h3>
        <span>${metrics.length} metrics</span>
      </div>

      <div class="metric-mini-list">
        ${metrics
      .map(
        (metric) => `
              <div class="metric-mini-item ${metric === config.recommended_metric ? "active" : ""}">
                <strong>${escapeHtml(formatMetricName(metric))}</strong>
                <span>${escapeHtml(getMetricDescription(metric))}</span>
              </div>
            `,
      )
      .join("")}
      </div>
    </div>
  `;

  bindRetrainControls();
}

function renderTestMetricControls(usedMetric = "") {
  const metrics = ["", "euclidean", "manhattan", "chebyshev", "minkowski_p3"];

  return `
    <div class="utility-section test-control-section">
      <div class="utility-section-head">
        <div>
          <h3>Test controls</h3>
          <p class="utility-section-desc">
            Run manual test cases with a specific distance metric without retraining the whole model.
          </p>
        </div>
      </div>

      <div class="test-control-row">
        <label class="experiment-field compact">
          <span>Metric for manual tests</span>
          <select id="testMetricSelect">
            ${metrics
              .map((metric) => {
                const label = metric ? formatMetricName(metric) : "Recommended metric";
                const selected = metric === usedMetric ? "selected" : "";
                return `<option value="${metric}" ${selected}>${label}</option>`;
              })
              .join("")}
          </select>
        </label>

        <button id="runTestMetricBtn" class="primary-btn" type="button">
          Run selected test
        </button>
      </div>
    </div>
  `;
}

async function loadTestDashboard(metric = "") {
  setActiveUtilityTab("btn-run-tests");
  showUtilityLoading("Running manual test cases...");

  try {
    const url = metric ? `/api/test-cases/run?metric=${encodeURIComponent(metric)}` : "/api/test-cases/run";
    const result = await jsonFetch(url);
    renderTestDashboard(result);
  } catch (error) {
    showUtilityError(error);
  }
}

function bindTestControls() {
  const btn = document.getElementById("runTestMetricBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const metric = document.getElementById("testMetricSelect")?.value || "";
    loadTestDashboard(metric);
  });
}

function renderTestDashboard(result) {
  show("#utilResult");

  const summary = result.summary || {};
  const cases = result.cases || [];
  const accuracy = summary.accuracy_on_manual_cases || 0;

  const clearCases = cases.filter((item) => item.name.includes("_clear"));
  const hardCases = cases.filter((item) => item.name.includes("_ambiguous"));

  function renderCases(title, list) {
    return `
      <div class="utility-section">
        <div class="utility-section-head">
          <h3>${escapeHtml(title)}</h3>
          <span>${list.filter((item) => item.is_correct).length}/${list.length} passed</span>
        </div>

        <div class="test-case-grid">
          ${list
        .map(
          (item) => `
                <div class="test-case-item ${item.is_correct ? "pass" : "fail"}">
                  <div class="test-case-color" style="background:${item.hex}"></div>
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(item.hex)} · rgb(${item.rgb.join(", ")})</span>
                  </div>
                  <div class="test-case-result">
                    <strong>${escapeHtml(item.predicted)}</strong>
                    <span>Expected: ${escapeHtml(item.expected)}</span>
                  </div>
                </div>
              `,
        )
        .join("")}
        </div>
      </div>
    `;
  }

  $("#utilOutput").innerHTML = `
    ${renderStatCards([
    {
      label: "Manual test accuracy",
      value: toPercent(accuracy),
      description: `${summary.correct_cases || 0}/${summary.total_cases || 0} cases passed`,
    },
    {
      label: "Used metric",
      value: formatMetricName(result.used_metric || "-"),
      description: "Metric used when running manual test cases",
    },
    {
      label: "Recommended metric",
      value: formatMetricName(result.recommended_metric || "-"),
      description: "Metric selected from model evaluation",
    },
  ])}

    <div class="utility-section">
      <div class="utility-section-head">
        <h3>Overall result</h3>
        <span>${toPercent(accuracy)}</span>
      </div>
      <div class="test-progress">
        <div style="width:${Math.round(accuracy * 100)}%"></div>
      </div>
    </div>

    ${renderCases("Clear color cases", clearCases)}
    ${renderCases("Ambiguous color cases", hardCases)}
  `;

  bindTestControls();
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
    setActiveUtilityTab("btn-config");
    showUtilityLoading("Loading model configuration...");

    try {
      const result = await jsonFetch("/api/config");
      renderConfigDashboard(result);
    } catch (error) {
      showUtilityError(error);
    }
  });

  $("#btn-summary").addEventListener("click", async () => {
    setActiveUtilityTab("btn-summary");
    showUtilityLoading("Loading model overview...");

    try {
      const result = await jsonFetch("/api/model/summary");
      renderSummaryDashboard(result);
    } catch (error) {
      showUtilityError(error);
    }
  });

  $("#btn-run-tests").addEventListener("click", () => {
    loadTestDashboard();
  });
}

bindEvents();
renderScanHistory();
document.getElementById("btn-summary")?.click();

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
