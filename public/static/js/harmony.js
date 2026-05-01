import { hsl2rgb, rgb2hex, rgb2hsl } from "./color.js";

export function generateHarmonies(rgb) {
  const [h, s, l] = rgb2hsl(...rgb);

  return [
    {
      name: "Complementary",
      colors: [rgb, hsl2rgb(h + 180, s, l)],
    },
    {
      name: "Analogous",
      colors: [hsl2rgb(h - 30, s, l), rgb, hsl2rgb(h + 30, s, l)],
    },
    {
      name: "Triadic",
      colors: [rgb, hsl2rgb(h + 120, s, l), hsl2rgb(h + 240, s, l)],
    },
  ].map((group) => ({
    ...group,
    colors: group.colors.map((item) => ({ rgb: item, hex: rgb2hex(...item) })),
  }));
}
