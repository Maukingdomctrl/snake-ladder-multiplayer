import { memo, useId, useMemo } from "react";
import { buildSnake, REF_GRID, type SnakeSpec } from "./redSnakeGeometry";

// A snake traced from the reference board: same skin/lighting system as the red snake, with a
// generic closed-mouth head (eye, nostril, forked tongue) placed on the snout frame.
function TracedSnake({ cellSize, spec, name }: { cellSize: number; spec: SnakeSpec; name: string }) {
  const uid = useId().replace(/[:]/g, "");
  const id = (n: string) => `ts-${name}-${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const g = useMemo(() => buildSnake(spec), [spec]);
  const P = spec.palette;

  const sx = cellSize / REF_GRID.cellW;
  const sy = cellSize / REF_GRID.cellH;
  const transform = `scale(${sx},${sy}) translate(${-REF_GRID.x0},${-REF_GRID.y0})`;

  // head frame: origin at the snout tip, +x out of the snout; put the eye on the side facing up
  const h = g.head;
  const a = (h.angle * Math.PI) / 180;
  const up = Math.cos(a) >= 0 ? -1 : 1; // local -y is screen-up when the snout points rightwards
  const k = h.width / 12;               // scale head details with the head size

  return (
    <g transform={transform}>
      <defs>
        <filter id={id("contact")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={id("soft")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.7" />
        </filter>
        <clipPath id={id("clip")}>
          <polygon points={g.body} />
        </clipPath>
        <radialGradient id={id("occ")} cx=".72" cy=".5" r=".62">
          <stop offset="0" stopColor={P.rim} stopOpacity=".5" />
          <stop offset=".7" stopColor={P.rim} stopOpacity=".2" />
          <stop offset="1" stopColor={P.rim} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("low")} cx=".2" cy=".55" r=".85" fx=".15" fy=".6">
          <stop offset="0" stopColor={P.highlight} stopOpacity=".14" />
          <stop offset=".45" stopColor={P.light} stopOpacity="0" />
          <stop offset=".8" stopColor={P.shadow} stopOpacity=".3" />
          <stop offset="1" stopColor={P.rim} stopOpacity=".5" />
        </radialGradient>
        <linearGradient id={id("up")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.rim} stopOpacity=".18" />
          <stop offset=".45" stopColor={P.light} stopOpacity="0" />
          <stop offset="1" stopColor={P.highlight} stopOpacity=".24" />
        </linearGradient>
        {g.scaleShapes.map((d, i) => (
          <g key={i} id={id(`scale${i}`)}>
            <path d={d} fill={url("occ")} transform="translate(.18,0) scale(1.1,1.14)" />
            <path d={d} fill="currentColor" />
            <path d={d} fill={url("low")} />
            <path d={d} fill={url("up")} />
          </g>
        ))}
        <radialGradient id={id("iris")} cx=".45" cy=".4" r=".6">
          <stop offset="0" stopColor="#fff4b0" />
          <stop offset=".5" stopColor="#f2c233" />
          <stop offset=".88" stopColor="#b8780c" />
          <stop offset="1" stopColor="#5a3006" />
        </radialGradient>
      </defs>

      <polygon points={g.shadowBody} fill="#0a0a0a" opacity={0.1} filter={url("contact")} transform="translate(2,3)" />

      {/* forked tongue, drawn under the head */}
      <g transform={`translate(${h.x},${h.y}) rotate(${h.angle}) scale(${k})`}>
        <path d="M-2,0 L9,0 M9,0 l5,-3 M9,0 l5,3" stroke="#c0202c" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <polygon points={g.body} fill={P.edge} stroke={P.edge} strokeWidth={2.8} strokeLinejoin="round" />
      <polygon points={g.body} fill={P.recess} />
      <g clipPath={url("clip")}>
        {g.scales.map((s, i) => (
          <use key={i} href={`#${id(`scale${s.shape}`)}`} color={s.color} transform={s.transform} />
        ))}
        <g filter={url("soft")}>
          {g.shading.map((b, i) => (
            <polygon key={i} points={b.points} fill={b.fill} opacity={b.opacity} />
          ))}
        </g>
      </g>

      {/* head details in the snout frame */}
      <g transform={`translate(${h.x},${h.y}) rotate(${h.angle}) scale(${k})`}>
        <path d={`M-1,0 C-6,${1.5 * -up} -12,${2 * -up} -17,${3 * -up}`} stroke={P.rim} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        <ellipse cx={-4} cy={3.5 * up} rx={1.3} ry={0.8} fill="#0a0808" />
        <g transform={`translate(-14,${6.5 * up})`}>
          <ellipse rx={4.6} ry={3.4} fill={P.rim} />
          <ellipse rx={3.8} ry={2.7} fill={url("iris")} />
          <circle cx={0.3} r={1.6} fill="#050202" />
          <ellipse cx={1.2} cy={-0.9} rx={0.9} ry={0.6} fill="#fff" />
          <path d={`M-4.6,${-1.8 * up} Q0,${-5 * up} 4.6,${-1.8 * up}`} stroke={P.rim} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
}

export default memo(TracedSnake);
