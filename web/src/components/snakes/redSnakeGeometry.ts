// Geometry + material for the red snake (83 -> 22), traced from the reference board.
//
// Everything is computed once in "reference" coordinates (the 1254px reference board photo);
// RedSnake maps that space onto the live board with a single transform.
//
// Body: centripetal Catmull-Rom centreline through a few control points -> tangent -> normal ->
// left/right edges. Width comes from the traced reference outline.
// Material: a cylinder lit by one soft light from the upper-left. For every centreline sample the
// surface normal round the body is N(θ) = sinθ·n + cosθ·z, and brightness is max(0, N·L), so the
// light follows every bend continuously.

export type Pt = [number, number];

// Reference-board grid (cell 1 is bottom-left), used to map onto the live board.
export const REF_GRID = { x0: 88, y0: 47, cellW: 110, cellH: 113.2 };

// Centreline control points (reference px), snout tip first.
const CONTROL: Pt[] = [
  [350, 206], [368.33, 216.14], [384.99, 238.27], [394.45, 271.77], [401.65, 326.89],
  [379.43, 385.36], [348.43, 439.87], [316.05, 501.54], [298.56, 569.05], [291.62, 638.52],
  [289.71, 708.34], [285.3, 785.03], [243.44, 844.78],
];

// Half-width along the body (reference px), 141 evenly spaced samples, snout -> tail tip.
const HALF_WIDTH = [
  0.2, 4.23, 7.65, 10.15, 11.69, 12.88, 13.7, 14.33, 14.92, 15.4, 15.5, 15.19, 14.42, 13.37, 12.66, 12.16,
  11.78, 11.58, 11.53, 11.59, 11.71, 11.83, 11.94, 12.01, 12.04, 12.03, 11.99, 11.92, 11.82, 11.7, 11.57,
  11.42, 11.27, 11.11, 10.95, 10.8, 10.66, 10.55, 10.46, 10.4, 10.38, 10.39, 10.43, 10.5, 10.59, 10.69,
  10.8, 10.92, 11.04, 11.16, 11.27, 11.37, 11.45, 11.52, 11.56, 11.58, 11.58, 11.56, 11.52, 11.47, 11.41,
  11.35, 11.3, 11.26, 11.23, 11.21, 11.2, 11.19, 11.2, 11.2, 11.21, 11.21, 11.21, 11.21, 11.2, 11.18,
  11.16, 11.12, 11.08, 11.04, 10.99, 10.94, 10.89, 10.84, 10.8, 10.77, 10.74, 10.72, 10.71, 10.71, 10.7,
  10.7, 10.7, 10.69, 10.68, 10.66, 10.64, 10.61, 10.58, 10.55, 10.51, 10.47, 10.43, 10.39, 10.35, 10.32,
  10.28, 10.25, 10.23, 10.21, 10.2, 10.19, 10.19, 10.18, 10.18, 10.18, 10.19, 10.19, 10.19, 10.19, 10.19,
  10.21, 10.23, 10.27, 10.32, 10.39, 10.46, 10.54, 10.61, 10.64, 10.62, 10.5, 10.26, 9.57, 8.33, 6.73,
  4.98, 3.3, 1.85, 0.72, 0,
];

const SAMPLES = 280;
// Light from the upper-left, tilted toward the viewer (x right, y down, z out of the screen).
const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l) as [number, number, number];
})();

const arcOf = (P: Pt[]) => {
  const a = [0];
  for (let i = 1; i < P.length; i++) a.push(a[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return a;
};
const locate = (A: number[], s: number): [number, number] => {
  let j = 1;
  while (j < A.length - 1 && A[j] < s) j++;
  return [j, (s - A[j - 1]) / (A[j] - A[j - 1] || 1)];
};
const smoothstep = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};
const fmt = (P: Pt[]) => P.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

// Seeded generators so the snake looks identical on every render / device.
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function centreline(C: Pt[]): Pt[] {
  const ext: Pt[] = [
    [2 * C[0][0] - C[1][0], 2 * C[0][1] - C[1][1]],
    ...C,
    [2 * C[C.length - 1][0] - C[C.length - 2][0], 2 * C[C.length - 1][1] - C[C.length - 2][1]],
  ];
  const dense: Pt[] = [];
  const lerp = (a: Pt, b: Pt, ta: number, tb: number, t: number): Pt => [
    (a[0] * (tb - t)) / (tb - ta) + (b[0] * (t - ta)) / (tb - ta),
    (a[1] * (tb - t)) / (tb - ta) + (b[1] * (t - ta)) / (tb - ta),
  ];
  const knot = (a: Pt, b: Pt) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4; // centripetal
  for (let k = 1; k < ext.length - 2; k++) {
    const [P0, P1, P2, P3] = [ext[k - 1], ext[k], ext[k + 1], ext[k + 2]];
    const t0 = 0, t1 = t0 + knot(P0, P1), t2 = t1 + knot(P1, P2), t3 = t2 + knot(P2, P3);
    for (let q = 0; q < 60; q++) {
      const t = t1 + ((t2 - t1) * q) / 60;
      const A1 = lerp(P0, P1, t0, t1, t), A2 = lerp(P1, P2, t1, t2, t), A3 = lerp(P2, P3, t2, t3, t);
      const B1 = lerp(A1, A2, t0, t2, t), B2 = lerp(A2, A3, t1, t3, t);
      dense.push(lerp(B1, B2, t1, t2, t));
    }
  }
  dense.push(C[C.length - 1]);
  // resample evenly by arc length
  const A = arcOf(dense), total = A[A.length - 1], out: Pt[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const [j, u] = locate(A, (total * k) / SAMPLES);
    out.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * u, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * u]);
  }
  return out;
}

function redHalfWidth(k: number) {
  // Catmull-Rom through the width samples (continuous, no steps)
  const x = (k / SAMPLES) * (HALF_WIDTH.length - 1);
  const j = Math.min(Math.floor(x), HALF_WIDTH.length - 2), t = x - j;
  const p0 = HALF_WIDTH[Math.max(j - 1, 0)], p1 = HALF_WIDTH[j], p2 = HALF_WIDTH[j + 1], p3 = HALF_WIDTH[Math.min(j + 2, HALF_WIDTH.length - 1)];
  return Math.max(0, 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t));
}

export type ScaleInstance = { shape: number; color: string; transform: string };
export type Band = { points: string; fill: string; opacity: number };

export type SnakePalette = {
  hue: number;        // base hue of the skin (deg)
  sat: number;        // base saturation (0..1)
  recess: string;     // colour between scales
  edge: string;       // outline colour
  shadow: string;     // form shadow
  light: string;      // broad light
  highlight: string;  // restrained highlight on the lit ridge
  rim: string;        // dark rim at the sides
};

export type SnakeSpec = {
  control: Pt[];                       // centreline control points (reference px), snout first
  halfWidth: (k: number) => number;    // half-width at sample k (0..SAMPLES)
  palette: SnakePalette;
  thicken?: number;                    // body multiplier (head kept exact)
};

export const SAMPLES_COUNT = 280;

export const RED_SPEC: SnakeSpec = {
  control: CONTROL,
  halfWidth: redHalfWidth,
  thicken: 1.15,
  palette: { hue: 354, sat: 0.66, recess: "#a3322b", edge: "#5a1512", shadow: "#4a0f0d", light: "#e8705e", highlight: "#f28a74", rim: "#3e0a09" },
};

export type SnakeGeometry = {
  head: { x: number; y: number; angle: number; width: number }; // snout frame for generic heads
  body: string;          // full outline (head + body)
  shadowBody: string;    // outline behind the head, for the soft contact shadow
  scales: ScaleInstance[];
  shading: Band[];       // soft form bands (blurred), clipped to the body
  scaleShapes: string[]; // 3 teardrop plate variants (unit space, pointing to the tail)
};

export type RedSnakeGeometry = SnakeGeometry;
export const buildRedSnake = () => buildSnake(RED_SPEC);

export function buildSnake(spec: SnakeSpec): SnakeGeometry {
  const C = centreline(spec.control);
  const P = spec.palette;
  const N = SAMPLES;
  // body ~15% thicker than the traced outline; head (first ~40 samples) kept exact, blended in smoothly
  const THICKEN = spec.thicken ?? 1;
  const W = C.map((_, k) => spec.halfWidth(k) * (1 + (THICKEN - 1) * smoothstep(30, 60, k)));
  const tang = (i: number) => {
    const a = C[Math.max(i - 1, 0)], b = C[Math.min(i + 1, N)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return { nx: -dy / d, ny: dx / d, ang: Math.atan2(dy, dx) };
  };
  const at = (f: number, i: number): Pt => {
    const { nx, ny } = tang(i);
    return [C[i][0] + nx * W[i] * f, C[i][1] + ny * W[i] * f];
  };
  const ds = arcOf(C)[N] / N;

  const left = C.map((_, i) => at(1, i)), right = C.map((_, i) => at(-1, i));
  const body = fmt([...left, ...[...right].reverse()]);
  const shadowBody = fmt([...left.slice(40), ...right.slice(40).reverse()]);

  // ---- lighting ----
  // in-plane component of the light along the +normal side, and the lit angle θ* round the body
  const lightAround = (i: number) => {
    const { nx, ny } = tang(i);
    const a = nx * LIGHT[0] + ny * LIGHT[1];
    return { D: Math.hypot(a, LIGHT[2]), th: Math.atan2(a, LIGHT[2]) };
  };
  const diffuseAt = (i: number, f: number) => {
    const { D, th } = lightAround(i);
    return Math.max(0, D * Math.cos(Math.asin(Math.max(-1, Math.min(1, f))) - th));
  };
  const curvature = (i: number) => {
    const a = tang(Math.max(i - 3, 0)).ang, b = tang(Math.min(i + 3, N)).ang;
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / (ds * (Math.min(i + 3, N) - Math.max(i - 3, 0)) || 1);
  };
  // f-range round the body where diffuse >= level (isophote), continuous along the body
  const lit = (i: number, level: number): [number, number] | null => {
    const { D, th } = lightAround(i);
    if (D <= level) return null;
    const al = Math.acos(level / D);
    const lo = Math.max(-Math.PI / 2, th - al), hi = Math.min(Math.PI / 2, th + al);
    return lo < hi ? [Math.sin(lo), Math.sin(hi)] : null;
  };
  const band = (from: number, lo: (i: number) => number, hi: (i: number) => number, fill: string, opacity: number): Band => {
    const A: Pt[] = [], B: Pt[] = [];
    for (let i = from; i <= N; i++) { A.push(at(lo(i), i)); B.push(at(hi(i), i)); }
    return { points: fmt([...A, ...B.reverse()]), fill, opacity };
  };
  const isoLo = (lv: number) => (i: number) => (lit(i, lv) ?? [0, 0])[0];
  const isoHi = (lv: number) => (i: number) => (lit(i, lv) ?? [0, 0])[1];
  const shading: Band[] = [
    // shadow side: from the edge facing away up to where the light starts to reach
    band(12, () => -1.25, isoLo(0.32), P.shadow, 0.26),
    band(12, isoHi(0.32), () => 1.25, P.shadow, 0.22),
    // broad soft light, then a restrained coral highlight on the lit ridge (no white)
    band(8, isoLo(0.7), isoHi(0.7), P.light, 0.2),
    band(8, isoLo(0.88), isoHi(0.88), P.highlight, 0.14),
    // dark maroon rim on both sides
    band(12, () => -1.25, () => -0.84, P.rim, 0.3),
    band(12, () => 0.84, () => 1.25, P.rim, 0.24),
  ];

  // ---- scales: rows along the centreline, wrapped round the cylinder, anterior plates on top ----
  const sr = rng(11);   // geometry randomness (kept separate so colour tweaks never move a scale)
  const cr = rng(97);   // colour randomness
  const tone = (s: number, f: number) => 0.5 + 0.5 * Math.sin(s * 0.021 + 1.3) * Math.cos(s * 0.013 + f * 0.9) + 0.18 * Math.sin(s * 0.057 + 2 * f);
  const rows: [number, number, number, number, number][] = [];
  {
    let acc = 0, row = 0, sArc = 0;
    for (let i = 1; i <= N; i++) {
      const d = Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]);
      acc += d; sArc += d;
      const w = W[i];
      const fine = sArc < 60 ? 0.5 : sArc < 130 ? 0.5 + (0.5 * (sArc - 60)) / 70 : 1;
      const step = Math.max(1.6, w * 0.5 * fine) * (0.94 + sr() * 0.12);
      if (acc < step) continue;
      acc = 0; row++;
      if (w < 1.5 || sArc < 10) continue;
      rows.push([i, row, step, fine, sArc]);
    }
  }
  const total = ds * N;
  const scales: ScaleInstance[] = [];
  for (const [i, row, step, fine, sArc] of rows.reverse()) {
    const w = W[i], { nx, ny, ang } = tang(i), K = fine < 0.8 ? 6 : 4, dth = (Math.PI * 0.8) / (K - 1);
    const kap = curvature(i), ph = (row % 2 ? 0.5 : 0) + (sr() - 0.5) * 0.18;
    for (let k = -1; k <= K; k++) {
      const th = -Math.PI * 0.4 + (k + ph) * dth;
      if (Math.abs(th) > Math.PI * 0.46) continue;
      const f = Math.sin(th), c = Math.cos(th);
      const x = C[i][0] + nx * w * f, y = C[i][1] + ny * w * f;
      const m = Math.max(0.75, Math.min(1.25, 1 - kap * w * f)); // rows compress inside a bend, open outside
      const len = step * 1.6 * m * (0.92 + sr() * 0.16), wid = w * dth * c * 1.18 * (0.9 + sr() * 0.2);
      const A = (ang * 180) / Math.PI + (sr() - 0.5) * 5;
      sr();
      const shape = Math.floor(sr() * 3);
      if (f > -0.1) sr();

      // colour = body colour under this light + natural variation
      const diff = diffuseAt(i, f);
      const t = sArc / total;
      const bend = Math.min(1, Math.abs(kap) * w * 2.2) * (kap * f > 0 ? 1 : 0.3);
      const rowV = 0.035 * Math.sin(row * 2.1) + 0.02 * Math.sin(row * 0.37 + 1);
      const grp = 0.05 * (tone(sArc, f) - 0.5) * 2;
      const odd = cr() < 0.06 ? -0.07 : cr() < 0.06 ? 0.06 : 0, jit = (cr() - 0.5) * 0.05;
      const warm = 1 - smoothstep(0.05, 0.4, t);          // upper body slightly warmer
      const tipDark = smoothstep(0.78, 1, t);               // tail a touch darker toward the tip
      const light = 0.26 + 0.28 * Math.pow(diff, 0.85) - 0.05 * bend - 0.04 * tipDark + rowV + grp + odd + jit;
      const Lv = Math.max(0.21, Math.min(0.56, light));
      const hue = P.hue + 9 * Math.min(1, diff) + 3 * warm + 2 * (tone(sArc * 1.3, f + 2) - 0.5) + (cr() - 0.5) * 2;
      const sat = P.sat + 0.06 * (cr() - 0.5) - 0.06 * (1 - diff);
      const color = `hsl(${(((hue % 360) + 360) % 360).toFixed(1)},${(sat * 100).toFixed(0)}%,${(Lv * 100).toFixed(1)}%)`;
      // light the scale's upper side on whichever side of the body faces the light
      const flip = lightAround(i).th < 0 ? -1 : 1;
      scales.push({
        shape,
        color,
        transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${A.toFixed(1)}) scale(${len.toFixed(2)},${(wid * flip).toFixed(2)})`,
      });
    }
  }

  const scaleShapes = [0, 1, 2].map((k) => {
    const a = [0.5, 0.46, 0.54][k], t = [0.6, 0.66, 0.56][k];
    return `M-.62,-${a} C.05,-${a + 0.06} ${t},-${a * 0.62} .64,0 C${t},${a * 0.62} .05,${a + 0.06} -.62,${a} Z`;
  });

  const t0 = tang(3);
  const head = { x: C[0][0], y: C[0][1], angle: (t0.ang * 180) / Math.PI + 180, width: Math.max(...W.slice(0, 40)) };
  return { head, body, shadowBody, scales, shading, scaleShapes };
}
