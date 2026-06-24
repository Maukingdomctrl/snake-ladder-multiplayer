import type { SnakeColors } from "./components/snakes/shared/types";

// 🐍 Exact snake endpoints
export const SNAKES: Record<number, number> = {
  98: 13,
  93: 37,
  89: 51,
  83: 22,
  69: 33,
  68: 2,
  64: 24,
  59: 18,
  52: 11,
  48: 9,
  46: 15,
};

// 🎨 Physical board colors and curve factors for slide animations
export type ClassicSnakeColors = SnakeColors & {
  curveFactor: number;
};

export const CLASSIC_SNAKES: Record<number, ClassicSnakeColors> = {
  98: { body: "#566b30", outline: "#243812", belly: "#8f9b73", scaleLight: "#8f9b73", scaleDark: "#2e4215", eye: "#f1c40f", curveFactor: 0.20 },
  93: { body: "#3d4a63", outline: "#181f30", belly: "#6b7a93", scaleLight: "#6b7a93", scaleDark: "#2a3550", eye: "#f1c40f", curveFactor: 0.18 },
  89: { body: "#2f63a8", outline: "#13294a", belly: "#5f93d8", scaleLight: "#5f93d8", scaleDark: "#1e4480", eye: "#f1c40f", curveFactor: 0.10 },
  83: { body: "#6b2c2c", outline: "#381010", belly: "#c98f8f", scaleLight: "#8b3a3a", scaleDark: "#4a1c1c", eye: "#d8c25a", curveFactor: 0.22 },
  69: { body: "#3a2a20", outline: "#1a120c", belly: "#6b5648", scaleLight: "#6b5648", scaleDark: "#261a12", eye: "#f1c40f", curveFactor: 0.14 },
  68: { body: "#c0392b", outline: "#5a0e08", belly: "#e74c3c", scaleLight: "#e74c3c", scaleDark: "#7a1810", eye: "#f1c40f", curveFactor: 0.25 },
  64: { body: "#b0472f", outline: "#4a1812", belly: "#d06a52", scaleLight: "#d06a52", scaleDark: "#7a2818", eye: "#f1c40f", curveFactor: 0.15 },
  59: { body: "#2e5a8a", outline: "#122a45", belly: "#5e8aba", scaleLight: "#5e8aba", scaleDark: "#1e3f64", eye: "#f1c40f", curveFactor: 0.12 },
  52: { body: "#1c3822", outline: "#0b1a0e", belly: "#4c6852", scaleLight: "#4c6852", scaleDark: "#122616", eye: "#f1c40f", curveFactor: 0.10 },
  48: { body: "#1f6fb2", outline: "#0a2f55", belly: "#4f9fe2", scaleLight: "#4f9fe2", scaleDark: "#0a2f55", eye: "#f1c40f", curveFactor: 0.13 },
  46: { body: "#d66827", outline: "#6b2c0d", belly: "#f69857", scaleLight: "#f69857", scaleDark: "#9c4211", eye: "#f1c40f", curveFactor: 0.11 },
};

// 🪜 Exact ladder endpoints
export const LADDERS: Record<number, number> = {
  8: 26,
  19: 38,
  21: 82,
  28: 53,
  36: 57,
  43: 77,
  50: 91,
  54: 88,
  61: 99,
  62: 96,
  66: 87,
};

// Automatically merges LADDERS and SNAKES
export const SNAKES_AND_LADDERS: Record<number, number> = {
  ...LADDERS,
  ...SNAKES,
};

// 🟦 The specific diagonal sequence (Red -> Blue -> Yellow -> Green)
export const CELL_COLORS = [
  "#E63946", // 0: Red
  "#2980B9", // 1: Blue
  "#F4D03F", // 2: Yellow
  "#27AE60", // 3: Green
];

// 👤 Player and lobby defaults
export const PLAYER_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
  "#9b59b6", "#e67e22", "#1abc9c", "#e91e63",
];

export const LOBBY_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
  "#9b59b6", "#e67e22", "#1abc9c", "#e91e63",
];

// 📍 Keeps tokens from completely stacking on top of each other
export const CLUSTER_OFFSETS = [
  { x:  0,    y:  0    },
  { x: -0.12, y: -0.12 },
  { x:  0.12, y:  0.12 },
  { x:  0.12, y: -0.12 },
  { x: -0.12, y:  0.12 },
  { x:  0,    y: -0.2  },
  { x: -0.2,  y:  0    },
  { x:  0.2,  y:  0    },
];

export const MAX_PLAYERS          = 8;
export const BOARD_SIZE           = 100;
export const WIN_SQUARE           = 100;
export const MIN_PLAYERS_TO_START = 2;

/**
 * Helper function to safely apply cluster offsets to a token based on the 
 * current size of the board cells. 
 */
export const getScaledClusterOffset = (playerIndex: number, cellSize: number) => {
  const offset = CLUSTER_OFFSETS[playerIndex % CLUSTER_OFFSETS.length];
  return {
    x: offset.x * cellSize,
    y: offset.y * cellSize,
  };
};