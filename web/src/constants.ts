// src/constants.ts

export const SNAKES: Record<number, number> = {
  46: 15, 48: 9, 52: 11, 59: 18,
  64: 24, 68: 2, 69: 33, 83: 22,
  89: 51, 93: 37, 98: 13,
};

export const LADDERS: Record<number, number> = {
  8: 26, 19: 38, 28: 53, 21: 82,
  36: 57, 43: 77, 50: 91, 54: 88,
  61: 99, 62: 95,
};

export const SNAKES_AND_LADDERS: Record<number, number> = {
  ...LADDERS,
  ...SNAKES,
};

export const PLAYER_COLORS = [
  "#ffffff", "#000000", "#ff00ff", "#00ffff",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

export const LOBBY_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
  "#9b59b6", "#e67e22", "#1abc9c", "#e91e63",
];

export const CELL_COLORS = [
  "#E44D26", "#2980B9", "#F1C40F", "#27AE60",
];

export const SNAKE_STYLES = [
  { body: "#8E44AD", belly: "#F1C40F" },
  { body: "#2980B9", belly: "#85C1E9" },
  { body: "#C0392B", belly: "#17202A" },
  { body: "#27AE60", belly: "#F1C40F" },
  { body: "#D35400", belly: "#F39C12" },
  { body: "#34495E", belly: "#95A5A6" },
];

export const CLUSTER_OFFSETS = [
  { x: 0,  y: 0  }, { x: -4, y: -4 }, { x: 4,  y: 4  }, { x: 4,  y: -4 },
  { x: -4, y: 4  }, { x: 0,  y: -6 }, { x: -6, y: 0  }, { x: 6,  y: 0  },
];

export const MAX_PLAYERS = 8;
export const BOARD_SIZE = 100;
export const WIN_SQUARE = 100;
export const MIN_PLAYERS_TO_START = 2;