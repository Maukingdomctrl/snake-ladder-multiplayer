// web/src/components/snakes/Snake.tsx
import { useId, useMemo, useRef } from "react";
import type { SnakeProps, SnakeColors, SnakeStyleConfig, Point } from "./shared/types";
import {
  getCentripetalCRPoint,
  withGhostEndpoints,
  resamplePolyline,
  chaikinSmooth,
  smoothstep,
  removeLoops,
  polylineToSmoothPath,
} from "./shared/geometry";

function useDeepCompareMemoize<T>(value: T): T {
  const ref = useRef<T>(value);
  if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
    ref.current = value;
  }
  return ref.current;
}
function useDeepCompareMemo<T>(factory: () => T, deps: any[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps.map(useDeepCompareMemoize));
}

export default function Snake({ id, waypoints, thickness = 14, colors, mobile = false, styleConfig }: SnakeProps) {
  const rid = useId().replace(/[:]/g, "");
  const clipId = `snake-clip-${id}-${rid}`;
  const bodyGradientId = `snake-body-${id}-${rid}`;

  const cfg: Required<SnakeStyleConfig> = {
    tailTaperEnd: 0.12,
    headRampStart: 0.75,
    scaleStride: 14,
    eyePosition: 0.9,
    fangLength: 0.9,
    jawStart: 0.7,
    ...styleConfig,
  };

  const computed = useDeepCompareMemo(() => {
    if (waypoints.length < 2) return null;

    // 1. Spine Generation
    const cleanPoints = waypoints.slice().reverse().filter((p, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.1;
    });
    const cp = withGhostEndpoints(cleanPoints);
    const numSegments = cleanPoints.length - 1;
    const denseSamples = cleanPoints.length * (mobile ? 20 : 40);
    const rawSpline: Point[] = [];
    for (let i = 0; i < denseSamples; i++) {
      const tGlobal = i / (denseSamples - 1);
      const seg = tGlobal * numSegments;
      const idx = Math.min(numSegments - 1, Math.floor(seg));
      const t = seg - idx;
      rawSpline.push(getCentripetalCRPoint(cp[idx], cp[idx + 1], cp[idx + 2], cp[idx + 3], t));
    }

    let spine = resamplePolyline(rawSpline, 2);
    spine = chaikinSmooth(spine, mobile ? 2 : 5);
    spine = resamplePolyline(spine, 2);
    const n = spine.length;

    const tangents: { tx: number; ty: number }[] = [];
    const normals: { nx: number; ny: number }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = spine[Math.max(0, i - 1)];
      const next = spine[Math.min(n - 1, i + 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      let tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
      if (i > 0) {
        const pt = tangents[i - 1];
        if (tx * pt.tx + ty * pt.ty < 0) { tx = -tx; ty = -ty; }
        const pn = normals[i - 1];
        if (nx * pn.nx + ny * pn.ny < 0) { nx = -nx; ny = -ny; }
      }
      tangents.push({ tx, ty });
      normals.push({ nx, ny });
    }

    // 2. Width Profiles
    const topWidths: number[] = [];
    const botWidths: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let top = smoothstep(0, cfg.tailTaperEnd, t) * (1 + smoothstep(cfg.headRampStart, 0.97, t) * 0.9) * thickness;
      let bot = smoothstep(0, cfg.tailTaperEnd, t) * (1 + smoothstep(cfg.headRampStart + 0.03, 0.98, t) * 1.6) * thickness;
      const droop = smoothstep(0.8, 0.97, t) * smoothstep(0.8, 0.97, t) * 0.25 * thickness;
      top -= droop;
      bot += droop;
      topWidths.push(top);
      botWidths.push(bot);
    }

    // 3. Boundaries & Loop Removal
    let left = spine.map((p, i) => ({
      x: p.x + normals[i].nx * botWidths[i],
      y: p.y + normals[i].ny * botWidths[i],
    }));
    let right = spine.map((p, i) => ({
      x: p.x - normals[i].nx * topWidths[i],
      y: p.y - normals[i].ny * topWidths[i],
    }));
    left = removeLoops(left);
    right = removeLoops(right);

    // 4. Round Tip (Head)
    const capPoint = spine[n - 1];
    for (let k = 0; k < Math.min(16, left.length); k++) {
      const idx = left.length - 1 - k;
      const blend = 1 - k / 16;
      const eased = blend * blend;
      left[idx] = { x: left[idx].x * (1 - eased) + capPoint.x * eased, y: left[idx].y * (1 - eased) + capPoint.y * eased };
      right[idx] = { x: right[idx].x * (1 - eased) + capPoint.x * eased, y: right[idx].y * (1 - eased) + capPoint.y * eased };
    }

    const leftPath = polylineToSmoothPath(left);
    const rightPath = polylineToSmoothPath([...right].reverse());
    const bodyPath = `${leftPath} ${rightPath.replace(/^M\s+([\-\d.]+)\s+([\-\d.]+)\s*/, "L $1 $2 ")} Z`;

    // 5. Head Features
    const idxAt = (t: number) => Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
    const eyeIdx = idxAt(cfg.eyePosition);
    const eyeTop = topWidths[eyeIdx];
    const eyeCenter = { x: spine[eyeIdx].x - normals[eyeIdx].nx * eyeTop * 0.5, y: spine[eyeIdx].y - normals[eyeIdx].ny * eyeTop * 0.5 };
    const eyeAngleDeg = Math.atan2(tangents[eyeIdx].ty, tangents[eyeIdx].tx) * (180 / Math.PI);
    const eyeLen = Math.max(6, eyeTop * 0.5);

    const tipIdx = n - 1;
    const tip = spine[tipIdx];
    const tipTan = tangents[tipIdx];
    const tongueLen = thickness * 1.8;
    const tongueBase = { x: tip.x + tipTan.tx * thickness * 0.1, y: tip.y + tipTan.ty * thickness * 0.1 };
    const tongueMid = { x: tip.x + tipTan.tx * tongueLen * 0.6, y: tip.y + tipTan.ty * tongueLen * 0.6 };
    const tongueTip = { x: tip.x + tipTan.tx * tongueLen, y: tip.y + tipTan.ty * tongueLen };
    const perp = { x: -tipTan.ty, y: tipTan.tx };
    const forkA = { x: tongueTip.x + perp.x * thickness * 0.25, y: tongueTip.y + perp.y * thickness * 0.25 };
    const forkB = { x: tongueTip.x - perp.x * thickness * 0.25, y: tongueTip.y - perp.y * thickness * 0.25 };
    const tonguePath = `M ${tongueBase.x} ${tongueBase.y} L ${tongueMid.x} ${tongueMid.y} L ${forkA.x} ${forkA.y} L ${tongueTip.x} ${tongueTip.y} L ${forkB.x} ${forkB.y} L ${tongueMid.x} ${tongueMid.y} Z`;

    const jawStartIdx = idxAt(cfg.jawStart);
    const jawPoints: Point[] = [];
    for (let i = jawStartIdx; i <= tipIdx; i += 2) {
      jawPoints.push({ x: spine[i].x + normals[i].nx * botWidths[i] * 0.8, y: spine[i].y + normals[i].ny * botWidths[i] * 0.8 });
    }
    const jawPath = polylineToSmoothPath(jawPoints);

    const fangBasePt = spine[idxAt(0.95)];
    const fangNrm = normals[idxAt(0.95)];
    const fangTan = tangents[idxAt(0.95)];
    const fangBase1 = { x: fangBasePt.x, y: fangBasePt.y };
    const fangBase2 = { x: fangBasePt.x + fangNrm.nx * topWidths[idxAt(0.95)] * 0.1, y: fangBasePt.y + fangNrm.ny * topWidths[idxAt(0.95)] * 0.1 };
    const fangLen = thickness * cfg.fangLength;
    const fangTip = { x: fangBase2.x + fangTan.tx * fangLen * 0.2 + fangNrm.nx * fangLen, y: fangBase2.y + fangTan.ty * fangLen * 0.2 + fangNrm.ny * fangLen };
    const fang2Base1 = { x: fangBase1.x - fangTan.tx * thickness * 0.2, y: fangBase1.y - fangTan.ty * thickness * 0.2 };
    const fang2Base2 = { x: fangBase2.x - fangTan.tx * thickness * 0.2, y: fangBase2.y - fangTan.ty * thickness * 0.2 };
    const fang2Tip = { x: fangTip.x - fangTan.tx * thickness * 0.2, y: fangTip.y - fangTan.ty * thickness * 0.2 };
    const fang1Path = `M ${fangBase1.x} ${fangBase1.y} Q ${fangBase2.x} ${fangBase2.y} ${fangTip.x} ${fangTip.y} Z`;
    const fang2Path = `M ${fang2Base1.x} ${fang2Base1.y} Q ${fang2Base2.x} ${fang2Base2.y} ${fang2Tip.x} ${fang2Tip.y} Z`;

    // 6. Scales
    let scalesSvg = "";
    if (!mobile) {
      let col = 0;
      for (let i = 10; i < n - 10; i += cfg.scaleStride) {
        const p = spine[i];
        const tan = tangents[i];
        const nrm = normals[i];
        const topPt = { x: p.x - nrm.nx * topWidths[i], y: p.y - nrm.ny * topWidths[i] };
        const botPt = { x: p.x + nrm.nx * botWidths[i], y: p.y + nrm.ny * botWidths[i] };
        const halfLen = cfg.scaleStride * 0.6;
        const pFwd = { x: p.x + tan.tx * halfLen, y: p.y + tan.ty * halfLen };
        const pBwd = { x: p.x - tan.tx * halfLen, y: p.y - tan.ty * halfLen };
        const fill = col % 2 === 0 ? colors.scaleLight : colors.scaleDark;
        scalesSvg += `<path d="M ${topPt.x} ${topPt.y} L ${pFwd.x} ${pFwd.y} L ${botPt.x} ${botPt.y} L ${pBwd.x} ${pBwd.y} Z" fill="${fill}" stroke="${colors.outline}" stroke-width="1.5" opacity="0.9"/>`;
        col++;
      }
    }

    return { bodyPath, scalesSvg, eyeCenter, eyeAngleDeg, eyeLen, eyeWid: eyeLen * 0.6, tonguePath, jawPath, fang1Path, fang2Path };
  }, [waypoints, thickness, colors, mobile, cfg]);

  if (!computed) return null;

  return (
    <g>
      <defs>
        {!mobile && (
          <>
            <clipPath id={clipId}>
              <path d={computed.bodyPath} />
            </clipPath>
            <linearGradient id={bodyGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.body} />
              <stop offset="40%" stopColor={colors.body} />
              <stop offset="80%" stopColor={colors.belly} />
              <stop offset="100%" stopColor={colors.outline} />
            </linearGradient>
          </>
        )}
      </defs>

      <path d={computed.tonguePath} stroke={colors.outline} strokeWidth={2} fill="#d63031" strokeLinejoin="round" />
      <path d={computed.bodyPath} fill={mobile ? colors.body : `url(#${bodyGradientId})`} />
      
      {!mobile && (
        <g clipPath={`url(#${clipId})`}>
          <g dangerouslySetInnerHTML={{ __html: computed.scalesSvg }} />
          <path d={computed.jawPath} stroke="rgba(0,0,0,0.35)" strokeWidth={6} fill="none" strokeLinecap="round" />
          <path d={computed.jawPath} stroke={colors.outline} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.9} />
        </g>
      )}

      <path d={computed.bodyPath} fill="none" stroke={colors.outline} strokeWidth={mobile ? 2 : 3} strokeLinejoin="round" />

      {!mobile && (
        <>
          <path d={computed.fang2Path} fill="#e0e0e0" stroke={colors.outline} strokeWidth={1} strokeLinejoin="round" />
          <path d={computed.fang1Path} fill="#ffffff" stroke={colors.outline} strokeWidth={1} strokeLinejoin="round" />
        </>
      )}

      <g transform={`translate(${computed.eyeCenter.x} ${computed.eyeCenter.y}) rotate(${computed.eyeAngleDeg})`}>
        <ellipse cx={0} cy={0} rx={computed.eyeLen} ry={computed.eyeWid} fill={colors.eye} stroke={colors.outline} strokeWidth="1.5" />
        <ellipse cx={0} cy={0} rx={computed.eyeLen * 0.15} ry={computed.eyeWid * 0.85} fill="#000" />
        {!mobile && <circle cx={computed.eyeLen * 0.2} cy={-computed.eyeWid * 0.3} r={computed.eyeWid * 0.2} fill="#fff" />}
      </g>
    </g>
  );
}