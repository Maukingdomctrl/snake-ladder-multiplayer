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

// 48 -> 9: blue-green snake, head at 48 (under the ladder in the reference), sweeps right and down through 32/29, tail ends in the middle of 9.
export const BLUE_48: SnakeSpec = {
  control: [
    [930, 648], [955, 660], [985, 672], [1012, 690], [1032, 718],
    [1045, 760], [1052, 810], [1050, 860], [1035, 900], [1020, 950], [1022, 995], [1033, 1040], [1038, 1082], [1028, 1122],
  ],
  halfWidth: profile({ head: 13.5, neck: 10, body: 12.5, headLen: 0.045, taperFrom: 0.72 }),
  palette: {
    hue: 192, sat: 0.6,
    recess: "#1f7a8c", edge: "#0a3440", shadow: "#082a33", light: "#62c4d4", highlight: "#8cd8e4", rim: "#06232b",
  },
};

// 52 -> 11: green snake, head at 49/52 looking left, straight down the 50/31/30 column, tail flicks right into 11.
export const GREEN_52: SnakeSpec = {
  control: [
    [1028, 580], [1048, 575], [1066, 581], [1081, 600], [1089, 630], [1091, 670], [1087, 710],
    [1084, 750], [1085, 790], [1088, 830], [1085, 865], [1085, 900], [1087, 930], [1096, 954],
    [1111, 965], [1130, 971],
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
    [1022, 243], [1045, 242], [1065, 255], [1080, 290], [1078, 330], [1066, 362], [1057, 392],
    [1056, 425], [1063, 452], [1077, 478], [1092, 500], [1102, 512],
  ],
  halfWidth: profile({ head: 12.5, neck: 9.5, body: 10.5, headLen: 0.08, taperFrom: 0.68 }),
  palette: BLUE_59.palette,
};

// 69 -> 33: purple snake, head raised at 69/52, down past 48 behind the blue 48 snake, tail tucked under the ladder at 33.
export const PURPLE_69: SnakeSpec = {
  control: [
    [992, 470], [967, 495], [955, 525], [952, 575], [957, 625], [962, 665], [958, 700],
    [945, 733], [928, 760], [913, 788],
  ],
  halfWidth: profile({ head: 12.5, neck: 9.5, body: 11, headLen: 0.08, taperFrom: 0.68 }),
  palette: {
    hue: 262, sat: 0.45,
    recess: "#4a3290", edge: "#1e1244", shadow: "#140c34", light: "#9a84e0", highlight: "#b4a2ee", rim: "#100a2c",
  },
};

// 68 -> 2: thick red snake. Top traced from the reference (head at 68/53 facing right, neck down past 53/48,
// across the top of 46/35 into 36); from 25/26 down it keeps the existing board path to 2.
export const RED_68: SnakeSpec = {
  control: [
    [928, 445], [898, 450], [870, 478], [857, 525], [855, 565], [850, 610], [835, 660], [800, 700], [750, 715],
    [690, 722], [630, 738], [592, 775], [585, 825], [594, 862], [640, 890], [682, 915], [682, 1015],
    [566, 1060], [456, 1037], [346, 1054], [253, 1122],
  ],
  halfWidth: profile({ head: 21, neck: 17, body: 21, headLen: 0.03, taperFrom: 0.8 }),
  palette: {
    hue: 355, sat: 0.42, value: -0.1,
    recess: "#4a1a1c", edge: "#180606", shadow: "#140405", light: "#8a4a4a", highlight: "#a26060", rim: "#100304",
  },
};

// 93 -> 37: thick charcoal-green snake (graded head to tail), head at 93/88 facing right, arcs left over 87 and down past 74 (behind the ladder),
// sweeps left across 66/65 (behind the green snake) and down past 57/44 (behind the ladder) to 37.
export const BLUE_93: SnakeSpec = {
  control: [
    [905, 142], [870, 135], [820, 133], [770, 140], [735, 165], [715, 210], [717, 265], [732, 320],
    [742, 370], [728, 420], [690, 458], [640, 478], [590, 492], [557, 525], [532, 570], [515, 625],
    [500, 680], [482, 725], [470, 755],
  ],
  halfWidth: profile({ head: 21, neck: 17, body: 21, headLen: 0.03, taperFrom: 0.8 }),
  palette: {
    hue: 145, hueEnd: 155, sat: 0.38, value: -0.1,
    recess: "#1e3a2a", edge: "#0a140e", shadow: "#08120c", light: "#4a7a5c", highlight: "#62906f", rim: "#060e09",
  },
};

// 98 -> 13: long, thick dark purple-charcoal snake. Head at 97/84 facing left, along the top of 84 and down the
// 85/76/65/56 column, sweeps right under 55, then down past 46/35/27 to its tail by 14/13.
export const GREEN_98: SnakeSpec = {
  control: [
    [383, 125], [420, 120], [470, 122], [515, 140], [545, 160], [560, 205], [567, 232], [558, 280],
    [548, 322], [558, 368], [562, 392], [550, 435], [542, 468], [548, 505], [562, 540], [600, 578], [660, 585], [715, 588], [752, 615], [765, 665],
    [760, 720], [750, 780], [748, 840], [765, 890], [800, 930], [850, 965], [885, 978],
  ],
  halfWidth: profile({ head: 21, neck: 17, body: 21, headLen: 0.03, taperFrom: 0.82 }),
  palette: {
    hue: 275, hueEnd: 268, sat: 0.3, value: -0.1,
    recess: "#35243f", edge: "#120a18", shadow: "#0e0814", light: "#6e5a80", highlight: "#8a7498", rim: "#0a0610",
  },
};
