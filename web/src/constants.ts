// src/constants.ts

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
export const CLASSIC_SNAKES: Record<
  number,
  { body: string; outline: string; spots: string; curveFactor: number }
> = {
  98: { body: "#566b30", outline: "#243812", spots: "#2e4215", curveFactor: 0.20 },
  93: { body: "#3d4a63", outline: "#181f30", spots: "#2a3550", curveFactor: 0.18 },
  89: { body: "#2f63a8", outline: "#13294a", spots: "#1e4480", curveFactor: 0.10 },
  83: { body: "#6b2c2c", outline: "#381010", spots: "#4a1c1c", curveFactor: 0.22 },
  69: { body: "#3a2a20", outline: "#1a120c", spots: "#261a12", curveFactor: 0.14 },
  68: { body: "#c0392b", outline: "#5a0e08", spots: "#7a1810", curveFactor: 0.25 },
  64: { body: "#b0472f", outline: "#4a1812", spots: "#7a2818", curveFactor: 0.15 },
  59: { body: "#2e5a8a", outline: "#122a45", spots: "#1e3f64", curveFactor: 0.12 },
  52: { body: "#1c3822", outline: "#0b1a0e", spots: "#122616", curveFactor: 0.10 },
  48: { body: "#1f6fb2", outline: "#0a2f55", spots: "#ffffff", curveFactor: 0.13 },
  46: { body: "#d66827", outline: "#6b2c0d", spots: "#9c4211", curveFactor: 0.11 },
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
  "#ffffff", "#000000", "#ff00ff", "#00ffff",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

export const LOBBY_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
  "#9b59b6", "#e67e22", "#1abc9c", "#e91e63",
];

// 📍 Keeps tokens from completely stacking on top of each other
export const CLUSTER_OFFSETS = [
  { x:  0, y:  0 },
  { x: -4, y: -4 },
  { x:  4, y:  4 },
  { x:  4, y: -4 },
  { x: -4, y:  4 },
  { x:  0, y: -6 },
  { x: -6, y:  0 },
  { x:  6, y:  0 },
];

export const MAX_PLAYERS          = 8;
export const BOARD_SIZE           = 100;
export const WIN_SQUARE           = 100;
export const MIN_PLAYERS_TO_START = 2;