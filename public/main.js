const state = {
  paletteSize: 8,
  lastSelected: null,
  selected: null,
};

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
  preview.src = img.src;
  document.getElementById("imagePreview").classList.remove("hidden");
  document.getElementById("uploadZone").classList.add("hidden");
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

document.getElementById("btn-config").addEventListener("click", async () => {
  const result = await jsonFetch("/api/config");
  document.getElementById("utilResult").classList.remove("hidden");
  document.getElementById("utilOutput").textContent = JSON.stringify(
    result,
    null,
    2,
  );
});

document.getElementById("btn-summary").addEventListener("click", async () => {
  const result = await jsonFetch("/api/model/summary");
  document.getElementById("utilResult").classList.remove("hidden");
  document.getElementById("utilOutput").textContent = JSON.stringify(
    result,
    null,
    2,
  );
});

document.getElementById("btn-run-tests").addEventListener("click", async () => {
  document.getElementById("utilResult").classList.remove("hidden");
  document.getElementById("utilOutput").textContent = "Running tests...";
  const result = await jsonFetch("/api/test-cases/run");
  document.getElementById("utilOutput").textContent = JSON.stringify(
    result,
    null,
    2,
  );
});
