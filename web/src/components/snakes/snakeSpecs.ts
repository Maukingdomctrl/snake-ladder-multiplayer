import { RED_SPEC, type Pt, type SnakeSpec } from "./redSnakeGeometry";

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

// 64 -> 24: red snake, head raised at 64/57, straight down past 44/37, hooks right into 24.
export const RED_64: SnakeSpec = {
  control: [
    [515, 452], [495, 466], [467, 490], [445, 520], [435, 560], [432, 605], [436, 655], [440, 705],
    [432, 755], [418, 805], [406, 850], [402, 878], [412, 898], [428, 905], [445, 895],
  ],
  halfWidth: profile({ head: 14, neck: 10.5, body: 12.5, headLen: 0.05, taperFrom: 0.75 }),
  palette: RED_SPEC.palette,
};

// 48 -> 9: indigo/blue snake, head raised at 52/53, down past 48, sweeps right through 32/29, tail at 12/9.
export const BLUE_48: SnakeSpec = {
  control: [
    [992, 470], [967, 495], [955, 525], [952, 575], [957, 625], [970, 665], [1000, 685], [1030, 715],
    [1045, 760], [1052, 810], [1050, 860], [1035, 900], [1020, 950], [1022, 1000], [1035, 1045], [1070, 1082],
  ],
  halfWidth: profile({ head: 13.5, neck: 10, body: 12.5, headLen: 0.045, taperFrom: 0.72 }),
  palette: {
    hue: 228, sat: 0.55,
    recess: "#2c3f94", edge: "#111a4a", shadow: "#0c1238", light: "#7890e8", highlight: "#98aef2", rim: "#0a1030",
  },
};

// 52 -> 11: green snake, head at 49/52 looking left, straight down the 50/31/30 column, tail flicks right into 11.
export const GREEN_52: SnakeSpec = {
  control: [
    [1025, 585], [1045, 576], [1065, 580], [1085, 605], [1090, 650], [1086, 700], [1083, 750],
    [1082, 800], [1082, 850], [1083, 895], [1090, 930], [1105, 953], [1120, 965], [1132, 970],
  ],
  halfWidth: profile({ head: 13.5, neck: 10.5, body: 12, headLen: 0.06, taperFrom: 0.75 }),
  palette: {
    hue: 140, sat: 0.5,
    recess: "#2a7a44", edge: "#0e3a1c", shadow: "#0a2a14", light: "#6cc88a", highlight: "#90dca8", rim: "#082410",
  },
};

// 46 -> 15: orange snake, head at 46/35 looking right, S-bend down through 35/26, tail ends by 15.
export const ORANGE_46: SnakeSpec = {
  control: [
    [697, 692], [680, 695], [655, 710], [637, 735], [632, 770], [645, 805], [680, 830],
    [705, 850], [717, 880], [720, 910], [722, 940],
  ],
  halfWidth: profile({ head: 12, neck: 9, body: 10, headLen: 0.08, taperFrom: 0.7 }),
  palette: {
    hue: 26, sat: 0.72,
    recess: "#c0601e", edge: "#5a2408", shadow: "#4a1c06", light: "#f6a860", highlight: "#fcc080", rim: "#3e1604",
  },
};

// 89 -> 51: blue snake, head at 89/72 looking left, gentle S down past 72/69, tail slips under the ladder at 51.
export const BLUE_89: SnakeSpec = {
  control: [
    [1020, 245], [1040, 243], [1065, 255], [1075, 280], [1072, 310], [1066, 345], [1057, 378],
    [1058, 420], [1073, 455], [1087, 485], [1100, 510],
  ],
  halfWidth: profile({ head: 12.5, neck: 9.5, body: 10.5, headLen: 0.08, taperFrom: 0.68 }),
  palette: BLUE_59.palette,
};
