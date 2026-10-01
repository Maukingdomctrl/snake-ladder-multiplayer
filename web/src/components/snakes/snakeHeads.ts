// Side-view head anatomy in a local "head frame":
//   u = distance back from the snout tip along the centreline (0 at the tip, growing toward the tail)
//   v = offset across the centreline, + toward the dorsal (top) side
// Both are in units of the body half-width B, so the head scales with the snake.
//
// Construction (all driven by SideHeadParams, so other species are parameter changes, not new drawings):
//   - neck:      a variable-width profile around the centreline, tapering from the body to the nape.
//   - skull:     snout cap -> snout top -> cranial roof as a few cubic Béziers, independent of the neck and
//                blended into the neck profile across the occipital zone (C1: smoothstep blend of C1 curves).
//   - upper jaw: its own region (snout, lip line, posterior edge below the brow); its lower edge is the lip.
//   - mandible:  a separate closed path, built once (mouth shut) and only ever rotated about the hinge P_h:
//                lowerJaw(t, θ) = rotate(baseLowerJaw(t), P_h, θ). It is drawn under the head, so the cheek
//                covers its base and the jaw emerges from the cheek joint.
//   - throat:    leaves the mandible's posterior border at the point whose tangent heads for the neck, so the
//                jaw -> throat -> neck underside is tangent-continuous at every opening angle.

export type HeadPt = [number, number];
export type Cubic = [HeadPt, HeadPt, HeadPt, HeadPt];

export type SideHeadParams = {
  headLength: number;      // snout tip -> occiput (back of the skull)
  skullWidth: number;      // skull breadth seen from above (for the top-down head; the side view doesn't show it)
  skullHeight: number;     // cranial roof height above the centreline
  snoutLength: number;     // snout tip -> brow
  snoutHeight: number;     // height of the snout top just behind the tip
  snoutTaper: number;      // how steeply the snout top converges on the tip (0 = level, 1 = steep wedge)
  occipitalBlend: number;  // length of the zone where the skull roof blends into the neck
  neckToHeadBlend: number; // hinge -> where the throat has merged into the neck underside
  lipLevel: number;        // height of the mouth line (negative = below the centreline)
  neckThickness: number;   // half-width of the neck at the nape (the body is 1)
  neckLength: number;      // snout tip -> where the neck has widened back into the body
  hingePosition: number;   // u of the jaw hinge P_h (it sits in the cheek, just below the mouth line)
  jawLength: number;       // chin -> hinge
  jawThickness: number;    // depth of the mandible at its base, below the mouth line
};

export const DEFAULT_SIDE_HEAD: SideHeadParams = {
  headLength: 5.0,
  skullWidth: 1.5,
  skullHeight: 1.2,
  snoutLength: 2.9,
  snoutHeight: 0.25,
  snoutTaper: 0.5,
  occipitalBlend: 1.8,
  neckToHeadBlend: 2.2,
  lipLevel: -0.5,
  neckThickness: 0.72,
  neckLength: 11.2,
  hingePosition: 4.6,
  jawLength: 3.95,
  jawThickness: 1.2,
};

export type SideHead = {
  p: SideHeadParams;
  join: number;                      // u where the head hands over to the body edges
  hinge: HeadPt;                     // P_h, fixed to the skull
  hingeAxis: number;                 // rest direction of the mandible from P_h (deg, toward the chin)
  curves: Record<"cap" | "snoutTop" | "roof" | "underCap" | "lip" | "maxillaBack", Cubic>;
  jaw: Cubic[];                      // base mandible (mouth shut), closed: rear -> top border -> chin -> bottom border -> angle -> rear
  jawRear: [number, number];         // jaw curves forming the posterior border (where the throat attaches)
  neckTop: (u: number) => number;    // neck profile, dorsal side
  neckBottom: (u: number) => number; // neck profile, ventral side (a little deeper: throat)
  skullTop: (u: number) => number;   // dorsal contour from the snout top back: skull blended into the neck
};

const add = (a: HeadPt, b: HeadPt, k = 1): HeadPt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: HeadPt, b: HeadPt): HeadPt => [a[0] - b[0], a[1] - b[1]];
const len = (a: HeadPt) => Math.hypot(a[0], a[1]);
const norm = (a: HeadPt): HeadPt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const unit = (deg: number): HeadPt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function sampleCubic([a, b, c, d]: Cubic, steps = 24): HeadPt[] {
  const out: HeadPt[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, m = 1 - t;
    const w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t;
    out.push([w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0], w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1]]);
  }
  return out;
}
const cubicTangent = ([a, b, c, d]: Cubic, t: number): HeadPt => {
  const m = 1 - t;
  return [3 * m * m * (b[0] - a[0]) + 6 * m * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]),
    3 * m * m * (b[1] - a[1]) + 6 * m * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1])];
};

export const sampleChain = (chain: Cubic[], steps = 24) => chain.flatMap((c, k) => sampleCubic(c, steps).slice(k ? 1 : 0));

// v(u) of a chain of cubics that runs monotonically in u
function graph(chain: Cubic[]) {
  const pts = sampleChain(chain, 64);
  return (u: number) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (u <= pts[i][0]) {
        const f = (u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1);
        return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
      }
    }
    return pts[pts.length - 1][1];
  };
}

export function sideHead(p: SideHeadParams): SideHead {
  const { headLength: L, skullHeight: Hs, snoutLength: Ls, neckThickness: Nt, neckLength: J, lipLevel: lv } = p;
  const hu = p.hingePosition, Tj = p.jawThickness;
  const hinge: HeadPt = [hu, lv - 0.25];
  const corner: HeadPt = [hu - 0.4, lv];                    // mouth corner (rictus), just in front of P_h

  // ---- neck: variable-width profile round the centreline, tapering from the body (1) to the nape (Nt) ----
  const neckFrom = L + 1.0;
  const neckTop = (u: number) => Nt + (1 - Nt) * smoothstep(neckFrom, J, u);
  const neckBottom = (u: number) => -(neckTop(u) + 0.1 * (1 - smoothstep(neckFrom, J, u)));

  // ---- skull (dorsal): small-radius snout cap -> snout top -> shallow convex cranial roof -> occiput ----
  const tip: HeadPt = [0, lv * 0.3];
  const TIP = unit(70);                                     // snout front leans back; cap and under-cap share it
  const front: HeadPt = [0.5, p.snoutHeight];
  const frontDir = norm([1, 0.2 + 0.5 * p.snoutTaper]);     // the snout top rises from the cap at this slope
  const brow: HeadPt = [Ls, Hs * 0.95];
  const occiput: HeadPt = [L, Hs * 0.9];
  const occSlope = -0.16;                                   // the roof is already falling toward the neck at the occiput
  const cap: Cubic = [tip, add(tip, TIP, 0.2), add(front, frontDir, -0.18), front];
  const snoutTop: Cubic = [front, add(front, frontDir, (Ls - 0.5) * 0.35), add(brow, [1, 0.05], -(Ls - 0.5) * 0.35), brow];
  const roof: Cubic = [brow, add(brow, [1, 0.05], (L - Ls) * 0.4), add(occiput, [1, occSlope], -(L - Ls) * 0.4), occiput];
  const skull = graph([snoutTop, roof]);
  const skullExt = (u: number) => (u <= L ? skull(u) : occiput[1] + occSlope * (u - L));
  const blend = (u: number) => smoothstep(L - 0.3 * p.occipitalBlend, L + p.occipitalBlend, u);
  const skullTop = (u: number) => skullExt(u) * (1 - blend(u)) + neckTop(u) * blend(u);

  // ---- upper jaw: under the snout cap, then the lip line back to the mouth corner; posterior edge below the brow ----
  const lipFront: HeadPt = [0.3, lv + 0.04];
  const underCap: Cubic = [tip, add(tip, TIP, -0.15), add(lipFront, [1, 0], -0.12), lipFront];
  const lip: Cubic = [lipFront, [lipFront[0] + 1.1, lv - 0.08], [corner[0] - 1.1, lv - 0.04], corner]; // slightly convex
  const maxTop: HeadPt = [Ls * 0.85, skull(Ls * 0.85)];
  const maxillaBack: Cubic = [maxTop, add(maxTop, [0.25, -0.4]), add(corner, [-0.2, 0.35]), corner];

  // ---- mandible (mouth shut): rear -> top border (tucked inside the upper jaw) -> chin -> bottom border -> angle -> rear ----
  const rear: HeadPt = [hu + 0.25, lv + 0.1];
  const chinTop: HeadPt = [hu - p.jawLength, lv + 0.02];
  const chinBottom: HeadPt = [chinTop[0] + 0.3, chinTop[1] - Tj * 0.45];
  const angle: HeadPt = [hu - 0.2, lv - Tj];                // deepest point of the mandible, just in front of P_h
  const topIn = norm([-1, 0.04]), bottomOut = norm([1, -0.16]); // border directions into / out of the chin (tangent-continuous)
  const back: HeadPt = [hu + 0.62, lv - 0.55];              // posterior border, behind P_h
  const jaw: Cubic[] = [
    [rear, [hu - 1.2, lv - 0.02], add(chinTop, topIn, -1.2), chinTop],                    // top border, parallel to the lip
    [chinTop, add(chinTop, topIn, Tj * 0.3), add(chinBottom, bottomOut, -Tj * 0.36), chinBottom], // rounded chin, set back under the snout
    [chinBottom, add(chinBottom, bottomOut, 1.1), add(angle, [-1.3, 0]), angle],           // bottom border: gentle mandibular arc
    [angle, add(angle, [0.4, 0]), add(back, [0, -0.35]), back],                            // angle of the jaw
    [back, add(back, [0, 0.3]), add(rear, [0.25, -0.02]), rear],                           // posterior border up to the rear (under the cheek)
  ];

  return {
    p, join: J, hinge, hingeAxis: (Math.atan2(chinTop[1] - hinge[1], chinTop[0] - hinge[0]) * 180) / Math.PI,
    curves: { cap, snoutTop, roof, underCap, lip, maxillaBack },
    jaw, jawRear: [3, 4], neckTop, neckBottom, skullTop,
  };
}

export const SIDE_HEAD = sideHead(DEFAULT_SIDE_HEAD);

// rotate a head-frame point about the hinge; positive degrees swing the chin down (mouth opens)
export function aboutHinge([u, v]: HeadPt, deg: number, [hu, hv]: HeadPt): HeadPt {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), du = u - hu, dv = v - hv;
  return [hu + du * c - dv * s, hv + du * s + dv * c];
}

export type SideHeadOutline = {
  dorsal: HeadPt[];   // snout tip -> join (top)
  ventral: HeadPt[];  // snout tip -> lip -> mouth corner -> (under the cheek) -> throat -> neck -> join (bottom)
  jaw: HeadPt[];      // the rotated mandible, closed
  lip: HeadPt[];      // mouth line: the upper jaw's lower edge behind the snout tip, back to the mouth corner
  upperJaw: HeadPt[]; // upper jaw region, closed
  throatAt: HeadPt;   // where the throat leaves the mandible in this pose
};

// The head at a given jaw opening (deg). Only the mandible turns; the throat re-attaches tangentially to it.
export function sideHeadOutline(h: SideHead, jawOpen: number): SideHeadOutline {
  const { cap, snoutTop, underCap, lip, maxillaBack } = h.curves;
  const step = 0.05;

  const dorsal = sampleCubic(cap, 12);
  for (let u = snoutTop[0][0] + step; u < h.join; u += step) dorsal.push([u, h.skullTop(u)]);
  dorsal.push([h.join, h.neckTop(h.join)]);

  const jawCurves = h.jaw.map((c) => c.map((q) => aboutHinge(q, jawOpen, h.hinge)) as Cubic);

  // throat attachment Q: the point on the mandible's posterior border whose tangent points at the neck merge N
  const nu = h.hinge[0] + h.p.neckToHeadBlend;
  const N: HeadPt = [nu, h.neckBottom(nu)];
  const dN = norm([1, (h.neckBottom(nu + 0.01) - h.neckBottom(nu - 0.01)) / 0.02]);
  let Q = jawCurves[h.jawRear[0]][0], tQ = norm(cubicTangent(jawCurves[h.jawRear[0]], 0)), best = Infinity;
  for (let k = h.jawRear[0]; k <= h.jawRear[1]; k++) {
    sampleCubic(jawCurves[k], 48).forEach((pt, s) => {
      const tan = norm(cubicTangent(jawCurves[k], s / 48)), toN = norm(sub(N, pt));
      const miss = Math.abs(tan[0] * toN[1] - tan[1] * toN[0]) + (tan[0] * toN[0] + tan[1] * toN[1] < 0 ? 2 : 0);
      if (miss < best) { best = miss; Q = pt; tQ = tan; }
    });
  }
  const reach = len(sub(N, Q));
  const corner = lip[3];
  const cheek: Cubic = [corner, add(corner, norm(sub(lip[3], lip[2])), 0.4), add(Q, tQ, -Math.min(0.3, reach * 0.3)), Q];
  const throat: Cubic = [Q, add(Q, tQ, reach * 0.4), add(N, dN, -reach * 0.35), N];
  const ventral = [...sampleChain([underCap, lip, cheek, throat], 24)];
  for (let u = nu + step; u < h.join; u += step) ventral.push([u, h.neckBottom(u)]);
  ventral.push([h.join, h.neckBottom(h.join)]);

  const lipPts = sampleCubic(lip, 24);
  const upperJaw = [...dorsal.filter((q) => q[0] <= maxillaBack[0][0]), ...sampleCubic(maxillaBack, 24).slice(1), ...sampleChain([underCap, lip], 24).reverse().slice(1)];

  return { dorsal, ventral, jaw: sampleChain(jawCurves, 24), lip: lipPts, upperJaw, throatAt: Q };
}
