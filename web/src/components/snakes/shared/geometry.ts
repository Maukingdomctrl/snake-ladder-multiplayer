// web/src/components/snakes/shared/geometry.ts
import type { Point } from "./types";

export function getKnotInterval(pA: Point, pB: Point): number {
  const dSq = (pB.x - pA.x) ** 2 + (pB.y - pA.y) ** 2;
  return Math.pow(dSq, 0.25);
}

export function getCentripetalCRPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const dt0 = getKnotInterval(p0, p1);
  const dt1 = getKnotInterval(p1, p2);
  const dt2 = getKnotInterval(p2, p3);
  const t0 = 0, t1 = t0 + dt0, t2 = t1 + dt1, t3 = t2 + dt2;
  const tu = t1 + t * dt1;
  if (Math.abs(dt1) < 1e-4) return p1;

  const A1x = p0.x + ((p1.x - p0.x) * (tu - t0)) / (t1 - t0 || 1);
  const A1y = p0.y + ((p1.y - p0.y) * (tu - t0)) / (t1 - t0 || 1);
  const A2x = p1.x + ((p2.x - p1.x) * (tu - t1)) / (t2 - t1 || 1);
  const A2y = p1.y + ((p2.y - p1.y) * (tu - t1)) / (t2 - t1 || 1);
  const A3x = p2.x + ((p3.x - p2.x) * (tu - t2)) / (t3 - t2 || 1);
  const A3y = p2.y + ((p3.y - p2.y) * (tu - t2)) / (t3 - t2 || 1);

  const B1x = A1x + ((A2x - A1x) * (tu - t0)) / (t2 - t0 || 1);
  const B1y = A1y + ((A2y - A1y) * (tu - t0)) / (t2 - t0 || 1);
  const B2x = A2x + ((A3x - A2x) * (tu - t1)) / (t3 - t1 || 1);
  const B2y = A2y + ((A3y - A2y) * (tu - t1)) / (t3 - t1 || 1);

  const Cx = B1x + ((B2x - B1x) * (tu - t1)) / (t2 - t1 || 1);
  const Cy = B1y + ((B2y - B1y) * (tu - t1)) / (t2 - t1 || 1);
  return { x: Cx, y: Cy };
}

export function withGhostEndpoints(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const p0 = points[0], p1 = points[1];
  const pn = points[points.length - 1], pm = points[points.length - 2];
  const g0 = { x: 2 * p0.x - p1.x, y: 2 * p0.y - p1.y };
  const g1 = { x: 2 * pn.x - pm.x, y: 2 * pn.y - pm.y };
  return [g0, ...points, g1];
}

export function resamplePolyline(points: Point[], stepPx: number): Point[] {
  const resampled: Point[] = [points[0]];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    let p0 = points[i - 1];
    const p1 = points[i];
    let dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    while (d + dist >= stepPx) {
      const t = (stepPx - d) / dist;
      const nx = p0.x + (p1.x - p0.x) * t;
      const ny = p0.y + (p1.y - p0.y) * t;
      resampled.push({ x: nx, y: ny });
      p0 = { x: nx, y: ny };
      dist -= stepPx - d;
      d = 0;
    }
    d += dist;
  }
  const tail = points[points.length - 1];
  const last = resampled[resampled.length - 1];
  if (Math.hypot(tail.x - last.x, tail.y - last.y) > 0.01) resampled.push(tail);
  return resampled;
}

export function chaikinSmooth(points: Point[], passes: number): Point[] {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    const next: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function segIntersection(p1: Point, p2: Point, p3: Point, p4: Point) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

export function removeLoops(boundary: Point[]): Point[] {
  let pts = boundary.slice();
  let changed = true;
  let safety = 0;
  while (changed && safety < 20) {
    changed = false;
    safety++;
    const n = pts.length;
    outer: for (let i = 0; i < n - 1; i++) {
      for (let j = i + 8; j < n - 1; j++) {
        const ix = segIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1]);
        if (ix) {
          const newPts = pts.slice(0, i + 1);
          newPts.push({ x: ix.x, y: ix.y });
          newPts.push(...pts.slice(j + 1));
          pts = newPts;
          changed = true;
          break outer;
        }
      }
    }
  }
  return pts;
}

export function polylineToSmoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
  }
  return d.trim();
}