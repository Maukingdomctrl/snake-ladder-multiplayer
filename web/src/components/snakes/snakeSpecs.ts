import type { Pt, SnakeSpec } from "./redSnakeGeometry";

const SAMPLES = 280;
const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

// Generic snake width profile (half-width, reference px) along the body, u = 0 (snout) .. 1 (tail tip):
// rounded snout -> head -> slightly narrower neck -> body -> long continuous taper to a fine tip.
export function profile(o: { head: number; neck: number; body: number; headLen: number; taperFrom: number }) {
  return (k: number) => {
    const u = k / SAMPLES;
    const snout = Math.sqrt(smooth(0, o.headLen * 0.45, u));
    const toNeck = smooth(o.headLen * 0.55, o.headLen * 1.6, u);
    const toBody = smooth(o.headLen * 1.6, o.headLen * 4, u);
    const w = o.head * (1 - toNeck) + o.neck * toNeck * (1 - toBody) + o.body * toBody;
    const tail = u < o.taperFrom ? 1 : Math.pow(1 - (u - o.taperFrom) / (1 - o.taperFrom), 1.1);
    return Math.max(0, w * snout * tail);
  };
}

// 59 -> 18: blue snake, head raised at 42/59, curls through 22/19 and ends at 18.
const BLUE_59_CONTROL: Pt[] = [
  [275, 572], [252, 578], [222, 606], [197, 645], [186, 690], [187, 740], [193, 785], [190, 835],
  [176, 885], [174, 935], [182, 975], [200, 1005], [232, 1022], [265, 1024], [292, 1013], [317, 982],
];

export const BLUE_59: SnakeSpec = {
  control: BLUE_59_CONTROL,
  halfWidth: profile({ head: 15, neck: 11.5, body: 14, headLen: 0.045, taperFrom: 0.72 }),
  palette: {
    hue: 214, sat: 0.62,
    recess: "#244f99", edge: "#0c1f48", shadow: "#0a1a40", light: "#6aa4e8", highlight: "#8fbef2", rim: "#081535",
  },
};
