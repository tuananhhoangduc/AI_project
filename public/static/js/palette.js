import { rgb2hex } from "./color.js";

function quantize(value, step) {
  return Math.min(255, Math.max(0, Math.round(value / step) * step));
}

export function buildPalette(img, maxColors) {
  const canvas = document.createElement("canvas");
  const target = 360;
  const scale = Math.min(1, target / Math.max(img.width, img.height));

  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const counts = new Map();
  const step = 16;
  let total = 0;

  for (let i = 0; i < data.length; i += 12) {
    const alpha = data[i + 3];
    if (alpha < 16) continue;

    const r = quantize(data[i], step);
    const g = quantize(data[i + 1], step);
    const b = quantize(data[i + 2], step);
    const key = `${r},${g},${b}`;

    counts.set(key, (counts.get(key) || 0) + 1);
    total += 1;
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([key, count]) => {
      const rgb = key.split(",").map(Number);
      return {
        rgb,
        hex: rgb2hex(...rgb),
        count,
        percentage: total ? Number(((count / total) * 100).toFixed(2)) : 0,
      };
    });
}

export function exportPaletteJson(palette) {
  downloadText("palette.json", JSON.stringify({ colors: palette }, null, 2), "application/json");
}

export function exportPaletteCss(palette) {
  const body = [
    ":root {",
    ...palette.map((color, index) => `  --palette-${index + 1}: ${color.hex};`),
    "}",
    "",
  ].join("\\n");

  downloadText("palette.css", body, "text/css");
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
