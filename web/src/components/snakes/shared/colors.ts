export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const gauss = (x: number, mu: number, sigma: number) => {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
};

export const hash = (i: number, j: number) => {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

export const scaleColor = (idx: number, r: number, lOffset = 0) => {
  const hue = 118 + (hash(idx, r) * 8 - 4);
  const sat = 48 + (hash(r, idx) * 10 - 5);
  const light = 42 + (hash(idx + r, r) * 12 - 6) + lOffset;
  return `hsl(${hue.toFixed(1)} ${clamp(sat, 20, 80).toFixed(1)}% ${clamp(light, 18, 75).toFixed(1)}%)`;
};

export function mixHex(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function buildBodyGradientStops(dark: string, mid: string, light: string) {
  return [
    { offset: "0%", color: mixHex(dark, mid, 0.4) },
    { offset: "15%", color: mid },
    { offset: "32%", color: mixHex(mid, light, 0.5) },
    { offset: "48%", color: light },
    { offset: "64%", color: mixHex(mid, light, 0.5) },
    { offset: "80%", color: mid },
    { offset: "92%", color: mixHex(dark, mid, 0.4) },
    { offset: "100%", color: dark },
  ];
}