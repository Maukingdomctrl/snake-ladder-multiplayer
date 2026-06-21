import { useId, useMemo } from "react";
import type { JSX } from "react";

export type Point = { x: number; y: number };

export type SnakeColors = {
  body: string;
  outline: string;
  belly?: string;
  spots?: string;
  highlight?: string;
  shadow?: string;
  eye?: string;
};

export type SnakeProps = {
  id: number;
  waypoints: Point[];
  thickness?: number;
  colors: SnakeColors;
  curveFactor?: number;
  facing?: 1 | -1;
  fangLength?: number;
  gradientBody?: boolean;
  refinedHead?: boolean;
};

const DEFAULTS = {
  highlight: "#a8e08f",
  shadow: "#1a2414",
  eye: "#d8c25a",
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gauss = (x: number, mu: number, sigma: number) => {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
};
const hash = (i: number, j: number) => {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

const scaleColor = (idx: number, r: number, lOffset = 0) => {
  const hue = 118 + (hash(idx, r) * 8 - 4);
  const sat = 48 + (hash(r, idx) * 10 - 5);
  const light = 42 + (hash(idx + r, r) * 12 - 6) + lOffset;
  return `hsl(${hue.toFixed(1)} ${clamp(sat, 20, 80).toFixed(1)}% ${clamp(light, 18, 75).toFixed(1)}%)`;
};

function smoothArray(arr: number[], passes = 2) {
  let a = [...arr];
  for (let p = 0; p < passes; p++) {
    const next = [...a];
    for (let i = 1; i < a.length - 1; i++) {
      next[i] = a[i - 1] * 0.25 + a[i] * 0.5 + a[i + 1] * 0.25;
    }
    a = next;
  }
  return a;
}

function smoothSpinePoints(points: Point[], passes = 4, keepEnds = 6) {
  let pts = [...points];
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const next = [...pts];
    for (let i = 1; i < n - 1; i++) {
      if (i < keepEnds || i > n - 1 - keepEnds) continue;
      next[i] = {
        x: pts[i - 1].x * 0.25 + pts[i].x * 0.5 + pts[i + 1].x * 0.25,
        y: pts[i - 1].y * 0.25 + pts[i].y * 0.5 + pts[i + 1].y * 0.25,
      };
    }
    pts = next;
  }
  return pts;
}

function ghostEndpoints(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const p0 = points[0];
  const p1 = points[1];
  const pn = points[points.length - 1];
  const pm = points[points.length - 2];
  return [
    { x: 2 * p0.x - p1.x, y: 2 * p0.y - p1.y },
    ...points,
    { x: 2 * pn.x - pm.x, y: 2 * pn.y - pm.y },
  ];
}

function knot(a: Point, b: Point) {
  const dsq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return Math.pow(dsq, 0.25);
}

function catmullRomCentripetal(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const dt0 = Math.max(1e-4, knot(p0, p1));
  const dt1 = Math.max(1e-4, knot(p1, p2));
  const dt2 = Math.max(1e-4, knot(p2, p3));

  const t0 = 0;
  const t1 = t0 + dt0;
  const t2 = t1 + dt1;
  const t3 = t2 + dt2;
  const u = t1 + t * dt1;

  const A1 = {
    x: lerp(p0.x, p1.x, (u - t0) / (t1 - t0)),
    y: lerp(p0.y, p1.y, (u - t0) / (t1 - t0)),
  };
  const A2 = {
    x: lerp(p1.x, p2.x, (u - t1) / (t2 - t1)),
    y: lerp(p1.y, p2.y, (u - t1) / (t2 - t1)),
  };
  const A3 = {
    x: lerp(p2.x, p3.x, (u - t2) / (t3 - t2)),
    y: lerp(p2.y, p3.y, (u - t2) / (t3 - t2)),
  };

  const B1 = {
    x: lerp(A1.x, A2.x, (u - t0) / (t2 - t0)),
    y: lerp(A1.y, A2.y, (u - t0) / (t2 - t0)),
  };
  const B2 = {
    x: lerp(A2.x, A3.x, (u - t1) / (t3 - t1)),
    y: lerp(A2.y, A3.y, (u - t1) / (t3 - t1)),
  };

  return {
    x: lerp(B1.x, B2.x, (u - t1) / (t2 - t1)),
    y: lerp(B1.y, B2.y, (u - t1) / (t2 - t1)),
  };
}

function sampleSpline(points: Point[], perSeg = 28): Point[] {
  if (points.length < 2) return points;
  const cp = ghostEndpoints(points);
  const segs = points.length - 1;
  const out: Point[] = [];
  for (let s = 0; s < segs; s++) {
    for (let i = 0; i < perSeg; i++) {
      const t = i / perSeg;
      out.push(
        catmullRomCentripetal(cp[s], cp[s + 1], cp[s + 2], cp[s + 3], t)
      );
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function resampleArc(points: Point[], step = 2): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-6) continue;

    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p;
      seg = Math.hypot(b.x - a.x, b.y - a.y);
      carry = 0;
      if (seg < 1e-6) break;
    }
    carry += seg;
  }

  const tail = points[points.length - 1];
  const last = out[out.length - 1];
  if (Math.hypot(tail.x - last.x, tail.y - last.y) > 0.05) out.push(tail);
  return out;
}

function closedPolylineToBezier(points: Point[]) {
  if (points.length < 3) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  const len = points.length;
  
  for (let i = 0; i < len; i++) {
    const p0 = points[(i - 1 + len) % len];
    const p1 = points[i];
    const p2 = points[(i + 1) % len];
    const p3 = points[(i + 2) % len];

    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };

    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d + " Z";
}

function closedBodyPath(left: Point[], right: Point[]) {
  const contour = [...left, ...[...right].reverse()];
  return closedPolylineToBezier(contour);
}

function polylineToBezier(points: Point[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function mixHex(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

type Geo = {
  spine: Point[];
  tangents: { tx: number; ty: number }[];
  normals: { nx: number; ny: number }[];
  topW: number[];
  botW: number[];
  left: Point[];
  right: Point[];
  ridge: Point[];
  n: number;
};

function buildGeometry(waypoints: Point[], base: number, refinedHead: boolean): Geo | null {
  if (waypoints.length < 2) return null;

  let spine = sampleSpline(waypoints, 120);
  spine = resampleArc(spine, 0.8);
  spine = smoothSpinePoints(spine, 4);

  const n = spine.length;
  if (n < 3) return null;

  const tangents: { tx: number; ty: number }[] = [];
  const normals: { nx: number; ny: number }[] = [];

  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 4)];
    const b = spine[Math.min(n - 1, i + 4)];
    let dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    if (i > 0) {
      const prev = tangents[i - 1];
      if (dx * prev.tx + dy * prev.ty < 0) {
        dx = -dx;
        dy = -dy;
      }
    }

    let nx = -dy,
      ny = dx;
    if (i > 0) {
      const pn = normals[i - 1];
      if (nx * pn.nx + ny * pn.ny < 0) {
        nx = -nx;
        ny = -ny;
      }
    }

    tangents.push({ tx: dx, ty: dy });
    normals.push({ nx, ny });
  }

  const curvatureWindow = 10;
  const curvatureRadius: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = tangents[Math.max(0, i - curvatureWindow)];
    const b = tangents[Math.min(n - 1, i + curvatureWindow)];
    const dot = clamp(a.tx * b.tx + a.ty * b.ty, -1, 1);
    const dtheta = Math.acos(dot);
    const ds = Math.hypot(
      spine[Math.min(n - 1, i + curvatureWindow)].x - spine[Math.max(0, i - curvatureWindow)].x,
      spine[Math.min(n - 1, i + curvatureWindow)].y - spine[Math.max(0, i - curvatureWindow)].y
    );
    const radius = dtheta > 1e-4 ? ds / dtheta : Infinity;
    curvatureRadius.push(radius);
  }
  
  const smoothedCurvatureRadius = smoothArray(
    curvatureRadius.map((r) => (Number.isFinite(r) ? r : 1e6)),
    3
  );

  for (let pass = 0; pass < 3; pass++) {
    const nextNormals = [...normals];
    for (let i = 1; i < n - 1; i++) {
      nextNormals[i] = {
        nx:
          normals[i - 1].nx * 0.25 +
          normals[i].nx * 0.5 +
          normals[i + 1].nx * 0.25,
        ny:
          normals[i - 1].ny * 0.25 +
          normals[i].ny * 0.5 +
          normals[i + 1].ny * 0.25,
      };

      const len = Math.hypot(nextNormals[i].nx, nextNormals[i].ny) || 1;
      nextNormals[i].nx /= len;
      nextNormals[i].ny /= len;
    }
    for (let i = 1; i < n - 1; i++) {
      normals[i] = nextNormals[i];
    }
  }

  let topW: number[] = [];
  let botW: number[] = [];

  const headStart = 0.86; 

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);

    let curvature = 0;
    if (i > 1 && i < n - 2) {
      const a = tangents[i - 1];
      const b = tangents[i + 1];
      curvature = Math.abs(a.tx * b.ty - a.ty * b.tx);
    }

    const tail = Math.pow(smoothstep(0.01, 0.14, t), 0.75);
    
    const bodyBulge = 1 + 0.12 * gauss(t, 0.45, 0.28) + Math.min(curvature, 0.6) * 0.04;
    
    let skull = 1;
    let jaw = 1;

    if (t > headStart) {
      const ht = (t - headStart) / (1 - headStart);
      if (refinedHead) {
        if (ht < 0.2) {
          skull = lerp(1.0, 1.35, smoothstep(0, 0.2, ht));
          jaw   = lerp(1.0, 1.25, smoothstep(0, 0.2, ht));
        } else if (ht < 0.5) {
          skull = lerp(1.35, 1.05, smoothstep(0.2, 0.5, ht));
          jaw   = lerp(1.25, 0.95, smoothstep(0.2, 0.5, ht));
        } else if (ht < 0.82) {
          skull = lerp(1.05, 0.45, smoothstep(0.5, 0.82, ht));
          jaw   = lerp(0.95, 0.4, smoothstep(0.5, 0.82, ht));
        } else {
          skull = lerp(0.45, 0.04, smoothstep(0.82, 1.0, ht));
          jaw   = lerp(0.4, 0.04, smoothstep(0.82, 1.0, ht));
        }
      } else {
        // unchanged — original 83 behavior
        if (ht < 0.25) {
          skull = lerp(1.0, 1.15, smoothstep(0, 0.25, ht));
          jaw = lerp(1.0, 1.35, smoothstep(0, 0.25, ht));
        } else if (ht < 0.55) {
          skull = lerp(1.15, 0.95, smoothstep(0.25, 0.55, ht));
          jaw = lerp(1.35, 1.05, smoothstep(0.25, 0.55, ht));
        } else if (ht < 0.85) {
          skull = lerp(0.95, 0.65, smoothstep(0.55, 0.85, ht));
          jaw = lerp(1.05, 0.75, smoothstep(0.55, 0.85, ht));
        } else {
          skull = lerp(0.65, 0.1, smoothstep(0.85, 1.0, ht));
          jaw = lerp(0.75, 0.1, smoothstep(0.85, 1.0, ht));
        }
      }
    }

    const common = base * tail * bodyBulge;
    
    const safeLimit = t > headStart 
      ? Infinity 
      : smoothedCurvatureRadius[i] * 1.6;
    
    const rawTop = common * 0.9 * skull;
    const rawBot = common * 1.05 * jaw;

    topW.push(Math.max(0.8, Math.min(rawTop, safeLimit)));
    botW.push(Math.max(0.8, Math.min(rawBot, safeLimit)));
  }

  topW = smoothArray(topW, 2);
  botW = smoothArray(botW, 2);

  const left = spine.map((p, i) => ({
    x: p.x + normals[i].nx * topW[i],
    y: p.y + normals[i].ny * topW[i],
  }));
  const right = spine.map((p, i) => ({
    x: p.x - normals[i].nx * botW[i],
    y: p.y - normals[i].ny * botW[i],
  }));

  const ridge: Point[] = [];
  for (let i = 0; i < n; i++) {
    ridge.push({
      x: spine[i].x + normals[i].nx * topW[i] * 0.12,
      y: spine[i].y + normals[i].ny * topW[i] * 0.12,
    });
  }

  return { spine, tangents, normals, topW, botW, left, right, ridge, n };
}

function scalePath(size: number, widthRatio: number) {
  const w = size * widthRatio;
  const h = size;

  return `
    M 0 ${-h * 0.58}
    Q ${w * 0.42} ${-h * 0.18} ${w * 0.34} ${h * 0.34}
    Q 0 ${h * 0.62} ${-w * 0.34} ${h * 0.34}
    Q ${-w * 0.42} ${-h * 0.18} 0 ${-h * 0.58}
    Z
  `;
}

export default function Snake({
  id,
  waypoints,
  thickness = 14,
  colors,
  facing = 1,
  fangLength = 0,
  gradientBody = false,
  refinedHead = false,
}: SnakeProps) {
  const rid = useId().replace(/[:]/g, "");
  const clipId = `snake-clip-${id}-${rid}`;
  const shadowId = `snake-shadow-${id}-${rid}`;
  const occBlurId = `snake-occ-${id}-${rid}`;
  const eyeIrisId = `snake-eye-iris-${id}-${rid}`;
  const bodyGradId = `body-grad-${id}-${rid}`;

  const palette = {
    body: colors.body,
    outline: colors.outline,
    highlight: colors.belly ?? colors.highlight ?? DEFAULTS.highlight,
    shadow: colors.shadow ?? DEFAULTS.shadow,
    spots: colors.spots ?? "#263014",
    eye: colors.eye ?? DEFAULTS.eye,
  };

  const bodyStops = useMemo(() => {
    const dark = palette.shadow;
    const mid = palette.body;
    const light = palette.highlight;
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
  }, [palette.shadow, palette.body, palette.highlight]);

  const c = useMemo(() => {
    const geo = buildGeometry(waypoints, thickness, refinedHead);
    if (!geo) return null;

    const bodyPath = closedBodyPath(geo.left, geo.right);
    const n = geo.n;
    const idxAt = (t: number) => clamp(Math.round(t * (n - 1)), 0, n - 1);

    const bodyEnd = Math.floor(n * 0.85);

    const ventral = geo.spine.slice(0, bodyEnd).map((p, i) => {
      const w = facing === 1 ? geo.botW[i] : geo.topW[i];
      return {
        x: p.x - geo.normals[i].nx * w * 0.52 * facing,
        y: p.y - geo.normals[i].ny * w * 0.52 * facing,
      };
    });

    const avgW = geo.topW.reduce((a, b) => a + b, 0) / n;

    const scaleDefs: JSX.Element[] = [];
    const bodyScales: JSX.Element[] = [];
    const bellyPlates: JSX.Element[] = [];
    const glints: JSX.Element[] = [];
    const headScales: JSX.Element[] = [];
    
    const bodyStart = 16; 
    const bodyStop = Math.floor(n * 0.85);
    const stride = 5; 
    const rows = 8;

    for (let i = bodyStart; i < bodyStop; i += stride) {
      for (let r = 0; r < rows; r++) {
        const stagger = r % 2 ? Math.floor(stride / 2) : 0;
        const idx = i + stagger;
        if (idx >= bodyStop) continue;

        const rowFrac = (r / (rows - 1)) * 1.7 - 0.85;
        const p = geo.spine[idx];
        const nm = geo.normals[idx];
        
        const stA = geo.spine[Math.max(0, idx - 6)];
        const stB = geo.spine[Math.min(n - 1, idx + 6)];
        const ang = (Math.atan2(stB.y - stA.y, stB.x - stA.x) * 180) / Math.PI + 90;

        const localW = rowFrac >= 0 ? geo.botW[idx] : geo.topW[idx];
        const perspective = 1 - Math.abs(rowFrac) * 0.58;
        const cx = p.x + nm.nx * localW * rowFrac;
        const cy = p.y + nm.ny * localW * rowFrac;
        const cross = geo.topW[idx] + geo.botW[idx];

        const bodyFactor = 0.7 + 0.5 * gauss(idx / (n - 1), 0.45, 0.22);
        const sz = clamp(cross * 0.22 * perspective * bodyFactor, 1.8, 9.5);

        const jx = (hash(idx, r) - 0.5) * sz * 0.25;
        const jy = (hash(r, idx) - 0.5) * sz * 0.25;

        const gradId = `sg-${id}-${idx}-${r}`;
        scaleDefs.push(
          <radialGradient key={gradId} id={gradId}>
            <stop offset="0%" stopColor={scaleColor(idx, r, 12)} />
            <stop offset="70%" stopColor={scaleColor(idx, r, 0)} />
            <stop offset="100%" stopColor={scaleColor(idx, r, -18)} />
          </radialGradient>
        );

        bodyScales.push(
          <g
            key={`bs-${idx}-${r}`}
            transform={`translate(${cx + jx} ${cy + jy}) rotate(${ang})`}
          >
            <path
              d={scalePath(sz, perspective)}
              fill={`url(#${gradId})`}
              stroke={palette.outline}
              strokeWidth={0.72}
              opacity={0.98}
            />
            <path
              d={`M 0 ${-sz * 0.42} L 0 ${sz * 0.55}`}
              stroke="#182010"
              strokeOpacity={0.35}
              strokeWidth={0.6}
              strokeLinecap="round"
            />
          </g>
        );

        if (hash(idx, r) > 0.95) {
          glints.push(
            <ellipse
              key={`g-${idx}-${r}`}
              cx={cx}
              cy={cy}
              rx={sz * 0.16}
              ry={sz * 0.08}
              fill="#fff"
              opacity={0.25}
            />
          );
        }
      }

      if (i % 6 === 0) {
        const p = geo.spine[i];
        const nm = geo.normals[i];
        
        const bA = geo.spine[Math.max(0, i - 6)];
        const bB = geo.spine[Math.min(n - 1, i + 6)];
        const angle = (Math.atan2(bB.y - bA.y, bB.x - bA.x) * 180) / Math.PI;

        const bottomX = p.x - nm.nx * geo.botW[i] * 0.75;
        const bottomY = p.y - nm.ny * geo.botW[i] * 0.75;
        const w = (geo.topW[i] + geo.botW[i]) * 0.85;
        const h = geo.botW[i] * 0.25;

        bellyPlates.push(
          <ellipse
            key={`bp-${i}`}
            cx={bottomX}
            cy={bottomY}
            rx={w * 0.5}
            ry={h}
            transform={`rotate(${angle} ${bottomX} ${bottomY})`}
            fill="#b4c96e"
            opacity={0.3}
          />
        );
      }
    }

    const plates = [
      { t: 0.99, side: 0, size: 0.5, name: "rostral" },
      { t: 0.975, side: -0.15, size: 0.55, name: "internasalL" },
      { t: 0.975, side: 0.15, size: 0.55, name: "internasalR" },
      { t: 0.955, side: -0.22, size: 0.65, name: "prefrontalL" },
      { t: 0.955, side: 0.22, size: 0.65, name: "prefrontalR" },
      { t: 0.935, side: 0, size: 0.85, name: "frontal" },
      { t: 0.94, side: -0.26, size: 0.55, name: "supraocularL" },
      { t: 0.94, side: 0.26, size: 0.55, name: "supraocularR" },
      { t: 0.93, side: -0.3, size: 0.5, name: "postocularL" },
      { t: 0.93, side: 0.3, size: 0.5, name: "postocularR" },
      { t: 0.91, side: -0.16, size: 0.9, name: "parietalL" },
      { t: 0.91, side: 0.16, size: 0.9, name: "parietalR" },
      { t: 0.97, side: -0.32, size: 0.45, name: "labial1L" },
      { t: 0.97, side: 0.32, size: 0.45, name: "labial1R" },
      { t: 0.95, side: -0.36, size: 0.5, name: "labial2L" },
      { t: 0.95, side: 0.36, size: 0.5, name: "labial2R" },
      { t: 0.92, side: -0.4, size: 0.55, name: "labial3L" },
      { t: 0.92, side: 0.4, size: 0.55, name: "labial3R" },
      { t: 0.89, side: -0.36, size: 0.6, name: "labial4L" },
      { t: 0.89, side: 0.36, size: 0.6, name: "labial4R" },
    ];

    plates.forEach((plate, pIdx) => {
      const idx = idxAt(plate.t);
      const p = geo.spine[idx];
      const nm = geo.normals[idx];
      
      const stA = geo.spine[Math.max(0, idx - 6)];
      const stB = geo.spine[Math.min(n - 1, idx + 6)];
      
      const sz = clamp(thickness * 0.28 * plate.size, 1.6, 7);
      
      const ang =
        (Math.atan2(stB.y - stA.y, stB.x - stA.x) * 180) / Math.PI +
        90 +
        plate.side * facing * 45;
        
      const widthForPlate = plate.name.startsWith("labial") ? geo.botW[idx] : geo.topW[idx];
      const cx = p.x + nm.nx * widthForPlate * plate.side * facing;
      const cy = p.y + nm.ny * widthForPlate * plate.side * facing;

      const gradId = `shg-${id}-${pIdx}`;
      scaleDefs.push(
        <radialGradient key={gradId} id={gradId}>
          <stop offset="0%" stopColor={scaleColor(idx, pIdx, 12)} />
          <stop offset="70%" stopColor={scaleColor(idx, pIdx, 0)} />
          <stop offset="100%" stopColor={scaleColor(idx, pIdx, -18)} />
        </radialGradient>
      );

      headScales.push(
        <g
          key={`plate-${plate.name}`}
          transform={`translate(${cx} ${cy}) rotate(${ang})`}
        >
          <path
            d={scalePath(sz, 1.0)}
            fill={`url(#${gradId})`}
            stroke={palette.outline}
            strokeWidth={0.8}
            opacity={0.98}
          />
          <path
            d={`M 0 ${-sz * 0.4} L 0 ${sz * 0.4}`}
            stroke="#182010"
            strokeOpacity={0.2}
            strokeWidth={0.6}
            strokeLinecap="round"
          />
        </g>
      );
    });

    const nostrilIdx = idxAt(0.975);
    const nN = geo.normals[nostrilIdx];
    const nT = geo.tangents[nostrilIdx];
    const nTop = geo.topW[nostrilIdx];
    const nostrilCenter = {
      x: geo.spine[nostrilIdx].x + nN.nx * nTop * 0.55 * facing - nT.tx * nTop * 0.05,
      y: geo.spine[nostrilIdx].y + nN.ny * nTop * 0.55 * facing - nT.ty * nTop * 0.05,
    };
    const nostrilR = Math.max(0.6, nTop * 0.08);

    const eyeIdx = idxAt(refinedHead ? 0.91 : 0.94);
    const eN = geo.normals[eyeIdx];
    const eT = geo.tangents[eyeIdx];
    const top = geo.topW[eyeIdx];

    const eyeCenter = {
      x: geo.spine[eyeIdx].x + eN.nx * top * (refinedHead ? 0.32 : 0.15) * facing - eT.tx * top * 0.18,
      y: geo.spine[eyeIdx].y + eN.ny * top * (refinedHead ? 0.32 : 0.15) * facing - eT.ty * top * 0.18,
    };
    
    const eyeR = refinedHead ? Math.max(1.6, top * 0.15) : Math.max(1.8, top * 0.18);
    const eyeAngle = (Math.atan2(eT.ty, eT.tx) * 180) / Math.PI + (facing === 1 ? 6 : -6);

    const b0 = {
      x: eyeCenter.x - eT.tx * eyeR * 0.7 - eN.nx * eyeR * 0.55 * facing,
      y: eyeCenter.y - eT.ty * eyeR * 0.7 - eN.ny * eyeR * 0.55 * facing,
    };
    const b1 = {
      x: eyeCenter.x + eN.nx * eyeR * (refinedHead ? 0.95 : 0.45) * facing - eT.tx * eyeR * 0.08,
      y: eyeCenter.y + eN.ny * eyeR * (refinedHead ? 0.95 : 0.45) * facing - eT.ty * eyeR * 0.08,
    };
    const b2 = {
      x: eyeCenter.x + eT.tx * eyeR * 0.75 - eN.nx * eyeR * 0.4 * facing,
      y: eyeCenter.y + eT.ty * eyeR * 0.75 - eN.ny * eyeR * 0.4 * facing,
    };
    const browPath = `M ${b0.x} ${b0.y} Q ${b1.x} ${b1.y} ${b2.x} ${b2.y}`;

    const j0 = idxAt(0.86);
    let jawPath = "";
    let jawOuter: Point[] = [];
    let jawInner: Point[] = [];
    for (let i = j0; i < n; i += 2) {
      jawOuter.push({
        x: geo.spine[i].x - geo.normals[i].nx * geo.botW[i] * 0.96 * facing,
        y: geo.spine[i].y - geo.normals[i].ny * geo.botW[i] * 0.96 * facing,
      });
      jawInner.push({
        x: geo.spine[i].x - geo.normals[i].nx * geo.botW[i] * 0.78 * facing,
        y: geo.spine[i].y - geo.normals[i].ny * geo.botW[i] * 0.78 * facing,
      });
    }
    if (jawOuter.length > 0) {
      jawPath = `M ${jawOuter[0].x} ${jawOuter[0].y}`;
      for (let i = 1; i < jawOuter.length; i++) jawPath += ` L ${jawOuter[i].x} ${jawOuter[i].y}`;
      for (let i = jawInner.length - 1; i >= 0; i--) jawPath += ` L ${jawInner[i].x} ${jawInner[i].y}`;
      jawPath += " Z";
    }

    const tip = geo.spine[n - 1];
    const tt = geo.tangents[n - 1];
    const tongueLen = thickness * 2.6;
    const tongueBase = {
      x: tip.x + tt.tx * thickness * 0.28,
      y: tip.y + tt.ty * thickness * 0.28,
    };
    const mid = {
      x: tip.x + tt.tx * tongueLen * 0.58,
      y: tip.y + tt.ty * tongueLen * 0.58,
    };
    const end = { x: tip.x + tt.tx * tongueLen, y: tip.y + tt.ty * tongueLen };
    const spread = thickness * 0.24;
    const forkA = { x: end.x - tt.ty * spread, y: end.y + tt.tx * spread };
    const forkB = { x: end.x + tt.ty * spread, y: end.y - tt.tx * spread };

    let fangPath = "";
    let fang2Path = "";
    if (fangLength > 0) {
      const fi = idxAt(0.965);
      const bx = geo.spine[fi].x - geo.normals[fi].nx * geo.botW[fi] * 0.74 * facing;
      const by = geo.spine[fi].y - geo.normals[fi].ny * geo.botW[fi] * 0.74 * facing;
      const ctrl = {
        x: bx + tt.tx * fangLength * 0.6 - geo.normals[fi].nx * fangLength * 0.5 * facing,
        y: by + tt.ty * fangLength * 0.6 - geo.normals[fi].ny * fangLength * 0.5 * facing,
      };
      const p1 = {
        x: bx + tt.tx * fangLength - geo.normals[fi].nx * fangLength * 0.3 * facing,
        y: by + tt.ty * fangLength - geo.normals[fi].ny * fangLength * 0.3 * facing,
      };
      const p2 = {
        x: geo.spine[fi].x - geo.normals[fi].nx * geo.botW[fi] * 0.24 * facing + tt.tx * fangLength * 0.3,
        y: geo.spine[fi].y - geo.normals[fi].ny * geo.botW[fi] * 0.24 * facing + tt.ty * fangLength * 0.3,
      };
      fangPath = `M ${bx} ${by} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;

      const fi2 = idxAt(0.945);
      const f2Len = fangLength * 0.6;
      const bx2 = geo.spine[fi2].x - geo.normals[fi2].nx * geo.botW[fi2] * 0.70 * facing;
      const by2 = geo.spine[fi2].y - geo.normals[fi2].ny * geo.botW[fi2] * 0.70 * facing;
      const ctrl2 = {
        x: bx2 + geo.tangents[fi2].tx * f2Len * 0.6 - geo.normals[fi2].nx * f2Len * 0.5 * facing,
        y: by2 + geo.tangents[fi2].ty * f2Len * 0.6 - geo.normals[fi2].ny * f2Len * 0.5 * facing,
      };
      const p1_2 = {
        x: bx2 + geo.tangents[fi2].tx * f2Len - geo.normals[fi2].nx * f2Len * 0.3 * facing,
        y: by2 + geo.tangents[fi2].ty * f2Len - geo.normals[fi2].ny * f2Len * 0.3 * facing,
      };
      const p2_2 = {
        x: geo.spine[fi2].x - geo.normals[fi2].nx * geo.botW[fi2] * 0.24 * facing + geo.tangents[fi2].tx * f2Len * 0.3,
        y: geo.spine[fi2].y - geo.normals[fi2].ny * geo.botW[fi2] * 0.24 * facing + geo.tangents[fi2].ty * f2Len * 0.3,
      };
      fang2Path = `M ${bx2} ${by2} Q ${ctrl2.x} ${ctrl2.y} ${p1_2.x} ${p1_2.y} L ${p2_2.x} ${p2_2.y} Z`;
    }

    return {
      bodyPath,
      ridgeHighlightPath: polylineToBezier(geo.ridge.slice(0, bodyEnd)),
      shadowPath: polylineToBezier(ventral),
      avgW,
      spine: geo.spine,
      scaleDefs,
      bodyScales,
      bellyPlates,
      glints,
      headScales,
      nostrilCenter,
      nostrilR,
      eyeCenter,
      eyeR,
      eyeAngle,
      browPath,
      jawPath,
      tongue: { base: tongueBase, mid, forkA, forkB },
      fangPath,
      fang2Path,
    };
  }, [
    id,
    waypoints,
    thickness,
    facing,
    fangLength,
    palette.body,
    palette.outline,
    palette.highlight,
    palette.shadow,
    palette.spots,
    refinedHead,
  ]);

  if (!c) return null;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={c.bodyPath} />
        </clipPath>

        <filter id={shadowId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4.8" />
          <feOffset dx="2" dy="5" result="off" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.38" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={occBlurId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={c.avgW * 0.55} />
        </filter>

        <radialGradient id={eyeIrisId} cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#ffd36a" />
          <stop offset="38%" stopColor="#e7a834" />
          <stop offset="72%" stopColor="#9a5a1b" />
          <stop offset="100%" stopColor="#4a2a10" />
        </radialGradient>

        <linearGradient
          id={bodyGradId}
          gradientUnits="userSpaceOnUse"
          x1={c.spine[0].x}
          y1={c.spine[0].y}
          x2={c.spine[c.spine.length - 1].x}
          y2={c.spine[c.spine.length - 1].y}
        >
          {bodyStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        
        {c.scaleDefs}
      </defs>

      <g filter={`url(#${shadowId})`}>
        <path
          d={`M ${c.tongue.base.x} ${c.tongue.base.y} L ${c.tongue.mid.x} ${c.tongue.mid.y} L ${c.tongue.forkA.x} ${c.tongue.forkA.y} M ${c.tongue.mid.x} ${c.tongue.mid.y} L ${c.tongue.forkB.x} ${c.tongue.forkB.y}`}
          stroke="#9e1818"
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d={c.bodyPath}
          fill={gradientBody ? `url(#${bodyGradId})` : palette.body}
          stroke={palette.outline}
          strokeWidth={2.4}
        />

        <g clipPath={`url(#${clipId})`}>
          {Array.from({ length: 18 }).map((_, i) => {
            const idx = Math.floor((i * (c.spine.length - 1)) / 18);
            const p = c.spine[idx];
            return (
              <ellipse
                key={i}
                cx={p.x}
                cy={p.y}
                rx={thickness * 0.7}
                ry={thickness * 0.4}
                fill="#3e3018"
                opacity={0.25}
              />
            );
          })}
        </g>

        <g clipPath={`url(#${clipId})`}>
          <path
            d={c.shadowPath}
            fill="none"
            stroke={palette.shadow}
            strokeWidth={c.avgW * 0.94}
            opacity={gradientBody ? 0.7 : 0.95}
            filter={`url(#${occBlurId})`}
            strokeLinecap="round"
          />
          <path
            d={c.ridgeHighlightPath}
            fill="none"
            stroke={palette.highlight}
            strokeWidth={c.avgW * 0.45}
            opacity={gradientBody ? 0.3 : 0.45}
            filter={`url(#${occBlurId})`}
            strokeLinecap="round"
          />

          {c.bodyScales}
          {c.bellyPlates}
          {c.glints}
          {c.headScales}
        </g>

        <path
          d={c.bodyPath}
          fill="none"
          stroke={palette.outline}
          strokeWidth={2.4}
        />
        
        <path
          d={c.jawPath}
          fill={palette.shadow}
          stroke={palette.outline}
          strokeWidth={0.8}
          opacity={0.75}
          strokeLinejoin="round"
        />

        {c.fang2Path && (
          <path
            d={c.fang2Path}
            fill="#dcdcb5"
            stroke={palette.outline}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
        )}
        
        {c.fangPath && (
          <path
            d={c.fangPath}
            fill="#f6f6d9"
            stroke={palette.outline}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
        )}

        <path
          d={c.browPath}
          stroke={palette.outline}
          strokeWidth={refinedHead ? 2.2 : 1.6}
          fill="none"
          opacity={refinedHead ? 0.9 : 0.72}
          strokeLinecap="round"
        />

        <ellipse
          cx={c.nostrilCenter.x}
          cy={c.nostrilCenter.y}
          rx={c.nostrilR}
          ry={c.nostrilR * 0.7}
          fill="#1a1410"
          opacity={0.85}
          transform={`rotate(${c.eyeAngle} ${c.nostrilCenter.x} ${c.nostrilCenter.y})`}
        />

        <g
          transform={`translate(${c.eyeCenter.x} ${c.eyeCenter.y}) rotate(${c.eyeAngle})`}
        >
          <ellipse
            rx={c.eyeR * 1.02}
            ry={c.eyeR * 0.86}
            fill={`url(#${eyeIrisId})`}
            stroke={palette.outline}
            strokeWidth={1.2}
          />
          <ellipse rx={c.eyeR * 0.13} ry={c.eyeR * 0.82} fill="#050505" />
          <ellipse
            rx={c.eyeR * 0.28}
            ry={c.eyeR * 0.9}
            fill="none"
            stroke="#000"
            strokeOpacity={0.35}
            strokeWidth={0.5}
          />
          <circle
            cx={-c.eyeR * 0.34}
            cy={-c.eyeR * 0.28}
            r={c.eyeR * 0.17}
            fill="#fff"
            opacity={0.88}
          />
          <circle
            cx={-c.eyeR * 0.12}
            cy={-c.eyeR * 0.4}
            r={c.eyeR * 0.08}
            fill="#fff"
            opacity={0.95}
          />
        </g>
      </g>
    </g>
  );
}