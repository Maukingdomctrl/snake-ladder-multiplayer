export type Point = { x: number; y: number };

export type SnakeColors = {
  body: string;       // Dorsal (back) base color
  belly: string;      // Ventral (belly) color
  scaleLight: string; // Lighter diamond scale color
  scaleDark: string;  // Darker diamond scale color
  eye: string;        // Sclera color of the eye
  outline: string;
};

export type SnakeStyleConfig = {
  tailTaperEnd?: number;
  headRampStart?: number;
  scaleStride?: number;
  eyePosition?: number;
  fangLength?: number;
  jawStart?: number;
  bulgeProfile?: { t: number; width: number }[];
};

export type SnakeProps = {
  id: number;
  waypoints: Point[];
  thickness?: number;
  colors: SnakeColors;
  mobile?: boolean;
  styleConfig?: SnakeStyleConfig;
};

// Added to support type safety in constants.ts
export type ClassicSnakeColors = SnakeColors & {
  curveFactor: number;
};