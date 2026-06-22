import { useId, useMemo, useRef } from "react";
import type { SnakeProps, SnakeStyleConfig, Point } from "./shared/types";
import {
  getCentripetalCRPoint,
  withGhostEndpoints,
  resamplePolyline,
  chaikinSmooth,
  smoothstep,
  removeLoops,
  polylineToSmoothPath,
} from "./shared/geometry";

// Deep Compare Memo Hook
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

// Custom Bulge Math Function
function getBulgeWidth(t: number, profile?: { t: number; width: number }[]): number {
  if (!profile || profile.length === 0) return 1;
  const sorted = [...profile].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].width;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].width;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].t && t <= sorted[i + 1].t) {
      const range = sorted[i + 1].t - sorted[i].t;
      const localT = range === 0 ? 0 : (t - sorted[i].t) / range;
      const smooth = localT * localT * (3 - 2 * localT);
      return sorted[i].width * (1 - smooth) + sorted[i + 1].width * smooth;
    }
  }
  return 1;
}

export default function Snake({ id, waypoints, thickness = 14, colors, mobile = false, styleConfig }: SnakeProps) {
  const rid = useId().replace(/[:]/g, "");
  const clipId = `snake-clip-${id}-${rid}`;
  const bodyGradientId = `snake-body-${id}-${rid}`;
  const scaleShadowId = `snake-scale-shadow-${id}-${rid}`;
  const bevelFilterId = `${scaleShadowId}-bevel`;

  // FIX: Memoize configuration object to prevent recreation on every render
  const cfg = useMemo<Required<Omit<SnakeStyleConfig, 'bulgeProfile'>> & { bulgeProfile?: { t: number; width: number }[] }>(() => ({
    tailTaperEnd: 0.12,
    headRampStart: 0.75,
    scaleStride: 14,
    eyePosition: 0.9,
    fangLength: 0.9,
    jawStart: 0.7,
    bulgeProfile: [],
    ...styleConfig,
  }), [styleConfig]);

  const computed = useDeepCompareMemo(() => {
    if (!waypoints || waypoints.length < 3) return null;

    // 1. Spine Generation
    const cleanPoints = waypoints.slice().reverse().filter((p, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.1;
    });

    if (cleanPoints.length < 3) return null;

    const cp = withGhostEndpoints(cleanPoints);
    const numSegments = Math.max(1, cleanPoints.length - 1);
    const sampleMultiplier = mobile ? 20 : 40;
    let denseSamples = Math.max(2, Math.round(cleanPoints.length * sampleMultiplier));
    if (denseSamples % 2 !== 0) denseSamples += 1;

    const rawSpline: Point[] = [];
    for (let i = 0; i < denseSamples; i++) {
      const tGlobal = i / (denseSamples - 1);
      const seg = tGlobal * numSegments;
      const idx = Math.min(numSegments - 1, Math.floor(seg));
      const t = seg - idx;
      const pt = getCentripetalCRPoint(cp[idx], cp[idx + 1], cp[idx + 2], cp[idx + 3], t);
      if (pt && pt.x !== undefined && pt.y !== undefined) rawSpline.push(pt);
    }

    if (rawSpline.length < 3) return null;

    let spine = resamplePolyline(rawSpline, 2);
    if (spine.length < 3) return null;
    spine = chaikinSmooth(spine, mobile ? 3 : 7); 
    spine = resamplePolyline(spine, 2);
    
    const n = spine.length;
    if (n < 3) return null;

    const tangents: { tx: number; ty: number }[] = [];
    const normals: { nx: number; ny: number }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = spine[Math.max(0, i - 3)];
      const next = spine[Math.min(n - 1, i + 3)];
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
      const bulge = getBulgeWidth(t, cfg.bulgeProfile);
      let top = smoothstep(0, cfg.tailTaperEnd, t) * (1 + smoothstep(cfg.headRampStart, 0.97, t) * 0.9) * thickness * bulge;
      let bot = smoothstep(0, cfg.tailTaperEnd, t) * (1 + smoothstep(cfg.headRampStart + 0.03, 0.98, t) * 1.6) * thickness * bulge;
      const droop = smoothstep(0.8, 0.97, t) * smoothstep(0.8, 0.97, t) * 0.25 * thickness * bulge;
      top -= droop;
      bot += droop;
      topWidths.push(top);
      botWidths.push(bot);
    }

    // 3. Boundaries & Loop Removal
    let left = spine.map((p, i) => ({ x: p.x + normals[i].nx * botWidths[i], y: p.y + normals[i].ny * botWidths[i] }));
    let right = spine.map((p, i) => ({ x: p.x - normals[i].nx * topWidths[i], y: p.y - normals[i].ny * topWidths[i] }));
    left = removeLoops(left);
    right = removeLoops(right);

    const minLen = Math.min(left.length, right.length, n);
    if (minLen < 3) return null;
    left = left.slice(0, minLen);
    right = right.slice(0, minLen);
    spine = spine.slice(0, minLen);
    tangents.length = minLen;
    normals.length = minLen;
    topWidths.length = minLen;
    botWidths.length = minLen;

    // 4. Round Tip (Head)
    const capPoint = spine[minLen - 1];
    // FIX: Use dynamic denominator for head cap blend to prevent distortion on small arrays
    for (let k = 0; k < Math.min(16, left.length); k++) {
      const idx = left.length - 1 - k;
      const blend = 1 - k / Math.min(16, left.length);
      const eased = blend * blend;
      left[idx] = { x: left[idx].x * (1 - eased) + capPoint.x * eased, y: left[idx].y * (1 - eased) + capPoint.y * eased };
      right[idx] = { x: right[idx].x * (1 - eased) + capPoint.x * eased, y: right[idx].y * (1 - eased) + capPoint.y * eased };
    }

    const leftPath = polylineToSmoothPath(left);
    const rightPath = polylineToSmoothPath([...right].reverse());
    // FIX: Regex handles scientific notation and explicit positive signs
    const bodyPath = `${leftPath} ${rightPath.replace(/^M\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*/, "L $1 $2 ")} Z`;

    // 3D Highlight Path (Simulates cylindrical lighting)
    const highlightPoints = spine.map((p, i) => ({
      x: p.x + normals[i].nx * (botWidths[i] - topWidths[i]) * 0.2,
      y: p.y + normals[i].ny * (botWidths[i] - topWidths[i]) * 0.2,
    }));
    // FIX: Guard against empty array slices breaking paths on tiny snakes
    const highlightSlice = highlightPoints.slice(5, minLen - 10);
    const highlightPath = highlightSlice.length >= 2 ? polylineToSmoothPath(highlightSlice) : "";

    // 5. Head Features
    const idxAt = (t: number) => Math.min(minLen - 1, Math.max(0, Math.round(t * (minLen - 1))));
    const eyeIdx = idxAt(cfg.eyePosition);
    const eyeTop = topWidths[eyeIdx];
    const eyeCenter = { x: spine[eyeIdx].x - normals[eyeIdx].nx * eyeTop * 0.5, y: spine[eyeIdx].y - normals[eyeIdx].ny * eyeTop * 0.5 };
    const eyeAngleDeg = Math.atan2(tangents[eyeIdx].ty, tangents[eyeIdx].tx) * (180 / Math.PI);
    const eyeLen = Math.max(6, eyeTop * 0.5);

    const tipIdx = minLen - 1;
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
    // FIX: Fangs are on the bottom-side, use botWidths instead of topWidths
    const fangBase2 = { 
      x: fangBasePt.x + fangNrm.nx * botWidths[idxAt(0.95)] * 0.1, 
      y: fangBasePt.y + fangNrm.ny * botWidths[idxAt(0.95)] * 0.1 
    };
    const fangLen = thickness * cfg.fangLength;
    const fangTip = { x: fangBase2.x + fangTan.tx * fangLen * 0.2 + fangNrm.nx * fangLen, y: fangBase2.y + fangTan.ty * fangLen * 0.2 + fangNrm.ny * fangLen };
    const fang2Base1 = { x: fangBase1.x - fangTan.tx * thickness * 0.2, y: fangBase1.y - fangTan.ty * thickness * 0.2 };
    const fang2Base2 = { x: fangBase2.x - fangTan.tx * thickness * 0.2, y: fangBase2.y - fangTan.ty * thickness * 0.2 };
    const fang2Tip = { x: fangTip.x - fangTan.tx * thickness * 0.2, y: fangTip.y - fangTan.ty * thickness * 0.2 };
    const fang1Path = `M ${fangBase1.x} ${fangBase1.y} Q ${fangBase2.x} ${fangBase2.y} ${fangTip.x} ${fangTip.y} Z`;
    const fang2Path = `M ${fang2Base1.x} ${fang2Base1.y} Q ${fang2Base2.x} ${fang2Base2.y} ${fang2Tip.x} ${fang2Tip.y} Z`;

    // 6. 3D Anatomical Overlapping Scales with Bevel Filter
    let scalesSvg = "";
    if (!mobile) {
      let col = 0;
      // FIX: Prevent XSS via dangerous HTML injection by stripping quotes from colors
      const safeOutline = colors.outline.replace(/"/g, "");
      
      for (let i = 10; i < minLen - 10; i += cfg.scaleStride) {
        const p = spine[i];
        const tan = tangents[i];
        const nrm = normals[i];
        const topW = topWidths[i];
        const botW = botWidths[i];
        const topPt = { x: p.x - nrm.nx * topW * 0.95, y: p.y - nrm.ny * topW * 0.95 };
        const botPt = { x: p.x + nrm.nx * botW * 0.95, y: p.y + nrm.ny * botW * 0.95 };
        const halfLen = cfg.scaleStride * 0.9; 
        const pFwd = { x: p.x + tan.tx * halfLen, y: p.y + tan.ty * halfLen };
        const pBwd = { x: p.x - tan.tx * halfLen, y: p.y - tan.ty * halfLen };

        const fill = col % 2 === 0 ? colors.scaleLight : colors.scaleDark;
        const safeFill = fill.replace(/"/g, "");
        
        scalesSvg += `<path d="M ${pFwd.x} ${pFwd.y} Q ${topPt.x} ${topPt.y} ${pBwd.x} ${pBwd.y} Q ${botPt.x} ${botPt.y} ${pFwd.x} ${pFwd.y} Z" fill="${safeFill}" stroke="${safeOutline}" stroke-width="1.2" opacity="0.9" filter="url(#${bevelFilterId})"/>`;
        col++;
      }
    }

    return { bodyPath, highlightPath, scalesSvg, eyeCenter, eyeAngleDeg, eyeLen, eyeWid: eyeLen * 0.6, tonguePath, jawPath, fang1Path, fang2Path };
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
            
            {/* Step 1: Enhanced Cylindrical Body Gradient */}
            <linearGradient id={bodyGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.belly} />
              <stop offset="15%" stopColor={colors.body} />
              <stop offset="45%" stopColor={colors.body} />
              <stop offset="75%" stopColor={colors.belly} />
              <stop offset="100%" stopColor={colors.outline} />
            </linearGradient>

            {/* Step 3: Sheen Highlight Gradient */}
            <linearGradient id={`${bodyGradientId}-sheen`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.5)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>

            {/* Step 2: Bevel/Emboss Filter for Scales */}
            <filter id={bevelFilterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
              <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.8" specularExponent="12" lightingColor="#ffffff" result="spec">
                <fePointLight x="-50" y="-100" z="120"/>
              </feSpecularLighting>
              <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClipped"/>
              <feComposite in="SourceGraphic" in2="specClipped" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
            </filter>
          </>
        )}
      </defs>

      <path d={computed.tonguePath} stroke={colors.outline} strokeWidth={2} fill="#d63031" strokeLinejoin="round" />
      <path d={computed.bodyPath} fill={mobile ? colors.body : `url(#${bodyGradientId})`} />
      
      {!mobile && (
        <g clipPath={`url(#${clipId})`}>
          {/* Step 3: Thick Gradient Sheen Stroke */}
          <path d={computed.highlightPath} stroke={`url(#${bodyGradientId}-sheen)`} strokeWidth={5} fill="none" strokeLinecap="round" />
          
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