import { memo, useId, useMemo } from "react";
import { buildRedSnake, REF_GRID } from "./redSnakeGeometry";

// The red snake (83 -> 22). Geometry is built once in reference-board space and mapped onto
// the live board with one transform, so it scales with the board without re-computing.
function RedSnake({ cellSize }: { cellSize: number }) {
  const uid = useId().replace(/[:]/g, "");
  const id = (name: string) => `rs-${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const g = useMemo(buildRedSnake, []);

  const sx = cellSize / REF_GRID.cellW;
  const sy = cellSize / REF_GRID.cellH;
  const transform = `scale(${sx},${sy}) translate(${-REF_GRID.x0},${-REF_GRID.y0})`;

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

        {/* scale plate: soft maroon occlusion behind it, per-scale colour, then its own light */}
        <radialGradient id={id("occ")} cx=".72" cy=".5" r=".62">
          <stop offset="0" stopColor="#3e0a09" stopOpacity=".5" />
          <stop offset=".7" stopColor="#4a0e0c" stopOpacity=".2" />
          <stop offset="1" stopColor="#4a0e0c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("low")} cx=".2" cy=".55" r=".85" fx=".15" fy=".6">
          <stop offset="0" stopColor="#ee7a64" stopOpacity=".14" />
          <stop offset=".45" stopColor="#b8382e" stopOpacity="0" />
          <stop offset=".8" stopColor="#7a1a18" stopOpacity=".3" />
          <stop offset="1" stopColor="#4e0f0d" stopOpacity=".5" />
        </radialGradient>
        <linearGradient id={id("up")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a1210" stopOpacity=".18" />
          <stop offset=".45" stopColor="#e8604c" stopOpacity="0" />
          <stop offset="1" stopColor="#f08a72" stopOpacity=".24" />
        </linearGradient>
        {g.scaleShapes.map((d, k) => (
          <g key={k} id={id(`scale${k}`)}>
            <path d={d} fill={url("occ")} transform="translate(.18,0) scale(1.1,1.14)" />
            <path d={d} fill="currentColor" />
            <path d={d} fill={url("low")} />
            <path d={d} fill={url("up")} />
          </g>
        ))}

        <linearGradient id={id("jaw")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e2a24" />
          <stop offset=".55" stopColor="#c84a40" />
          <stop offset="1" stopColor="#e07e6c" />
        </linearGradient>
        <radialGradient id={id("iris")} cx=".45" cy=".4" r=".6">
          <stop offset="0" stopColor="#fff4b0" />
          <stop offset=".5" stopColor="#f2c233" />
          <stop offset=".88" stopColor="#b8780c" />
          <stop offset="1" stopColor="#5a3006" />
        </radialGradient>
      </defs>

      {/* faint contact shadow under the body only (never under the head / mouth) */}
      <polygon points={g.shadowBody} fill="#2a0a06" opacity={0.1} filter={url("contact")} transform="translate(2,3)" />

      {/* burgundy edge, not black */}
      <polygon points={g.body} fill="#5a1512" stroke="#5a1512" strokeWidth={2.8} strokeLinejoin="round" />

      {/* mouth: one solid interior colour, tucked under both jaws; lower jaw; tongue; fangs */}
      <path d="M384,258 L368,232 L358,212 L350,209 C346,215 341,221 336,227 C348,238 364,249 378,257 Z" fill="#8c2430" />
      <path
        transform="translate(381,254) rotate(-150)"
        d="M-2,-6 C10,-7.5 28,-6 44,-2.6 C49,-1.6 50.5,0 49.5,1.2 C47,2.4 40,2.2 30,2.6 C18,3.1 8,4 -2,5 Z"
        fill={url("jaw")} stroke="#4a0f0c" strokeWidth={1.6} strokeLinejoin="round"
      />
      <path d="M373,246 C366,240 357,233 343,224 M343,224 l-9,-3 M343,224 l-7,5" stroke="#b01e2a" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M360,224 C357,228 354,231 350,232 C353,229 355,226 357,222 Z" fill="#fffaf0" stroke="#8a6a60" strokeWidth={0.5} />
      <path d="M364,230 C361,233 358,236 355,237 C357,234 359,231 361,228 Z" fill="#fffaf0" stroke="#8a6a60" strokeWidth={0.5} />
      <path d="M368,237 l-2.4,1.6 l1.6,-2.6 Z M371,242 l-2.2,1.5 l1.4,-2.4 Z" fill="#fffaf0" />

      {/* skin: recess colour, scales, then the continuous cylinder light — all clipped to the body */}
      <polygon points={g.body} fill="#a3322b" />
      <g clipPath={url("clip")}>
        {g.scales.map((s, k) => (
          <use key={k} href={`#${id(`scale${s.shape}`)}`} color={s.color} transform={s.transform} />
        ))}
        <g filter={url("soft")}>
          {g.shading.map((b, k) => (
            <polygon key={k} points={b.points} fill={b.fill} opacity={b.opacity} />
          ))}
        </g>
      </g>

      {/* head details */}
      <g fill="#4a0d0a" opacity={0.85}>
        <path d="M384,238 C389,244 392,250 393,257 C390,256 387,251 384,246 Z" />
        <path d="M372,208 c3,-1 6,0 7,2 c-2,2 -5,2 -7,-2 Z" />
        <path d="M384,214 c3,0 5,2 5,4 c-3,1 -5,0 -5,-4 Z" />
        <path d="M377,217 c2,-1 4,0 4,2 c-2,1 -4,0 -4,-2 Z" />
        <path d="M392,224 c3,1 5,4 5,7 c-3,0 -5,-3 -5,-7 Z" />
        <path d="M395,238 c2,1 4,4 4,6 c-2,0 -4,-2 -4,-6 Z" />
        <circle cx="366" cy="210" r="1.1" />
        <circle cx="389" cy="231" r="1" />
        <circle cx="398" cy="250" r="1.2" />
      </g>
      <path d="M371,234 C372,227 378,223 386,226" stroke="#4a0d0a" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M356,219 C361,228 367,239 378,252" stroke="#3a0806" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <ellipse cx="357" cy="211" rx="1.6" ry="1" transform="rotate(60 357 211)" fill="#1a0a08" />
      <g transform="translate(378,230) rotate(-120)">
        <ellipse rx="7.6" ry="5.4" fill="#4a0f0c" />
        <ellipse rx="6.4" ry="4.3" fill={url("iris")} />
        <path
          d="M0,0 L6,0 M0,0 L-6,0 M0,0 L4.4,2.9 M0,0 L-4.4,2.9 M0,0 L4.4,-2.9 M0,0 L-4.4,-2.9 M0,0 L1.6,4 M0,0 L-1.6,4 M0,0 L1.6,-4 M0,0 L-1.6,-4"
          stroke="#9a5a08" strokeWidth={0.35} opacity={0.6}
        />
        <circle cx="-.3" r="2.5" fill="#050202" />
        <ellipse rx="6.4" ry="4.3" fill="none" stroke="#3a0a08" strokeWidth={0.7} />
        <path d="M-6.4,-1 A6.4,4.3 0 0 1 6.4,-1 L6.4,-2.2 A6.4,4.3 0 0 0 -6.4,-2.2 Z" fill="#000" opacity={0.25} />
        <ellipse cx="-2.3" cy="-1.6" rx="1.6" ry="1" fill="#fff" />
        <circle cx="2.3" cy="1.5" r=".55" fill="#fff" opacity={0.75} />
        <path d="M-7.4,-2.8 Q0,-7.6 7.4,-2.8" stroke="#6e1a16" strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <path d="M-6.6,-3.6 Q0,-7.6 6.6,-3.6" stroke="#ef7a6c" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

export default memo(RedSnake);
