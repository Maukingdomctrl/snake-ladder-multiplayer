// web/src/components/snakes/shared/types.ts
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
};

export type SnakeProps = {
  id: number;
  waypoints: Point[];
  thickness?: number;
  colors: SnakeColors;
  mobile?: boolean;
  styleConfig?: SnakeStyleConfig;
  curveFactor?: number; // kept for Board.tsx compatibility
  facing?: 1 | -1;      // kept for Board.tsx compatibility
};