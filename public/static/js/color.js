export function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function rgb2hex(r, g, b) {
  return `#${[r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("")}`;
}

export function hex2rgb(hex) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error("HEX color is invalid");
  }
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

export function rgb2hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [clamp((r1 + m) * 255), clamp((g1 + m) * 255), clamp((b1 + m) * 255)];
}

export function rgbToLab(rgb) {
  let [r, g, b] = rgb.map((v) => v / 255);

  [r, g, b] = [r, g, b].map((v) =>
    v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92,
  );

  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  [x, y, z] = [x, y, z].map((v) =>
    v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116,
  );

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE76(rgbA, rgbB) {
  const labA = rgbToLab(rgbA);
  const labB = rgbToLab(rgbB);
  return Math.sqrt(
    Math.pow(labA[0] - labB[0], 2) +
      Math.pow(labA[1] - labB[1], 2) +
      Math.pow(labA[2] - labB[2], 2),
  );
}

export function describeDeltaE(delta) {
  if (delta < 1) return "Gần như không thể phân biệt bằng mắt thường.";
  if (delta < 2) return "Rất khó phân biệt.";
  if (delta < 10) return "Có thể thấy khác biệt nhẹ.";
  if (delta < 25) return "Khác biệt rõ.";
  return "Khác biệt rất mạnh.";
}
