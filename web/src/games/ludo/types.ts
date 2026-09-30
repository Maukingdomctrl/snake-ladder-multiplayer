// Shape of a Ludo room document as written by the server (server/ludo).
// The client only ever reads this; every change goes through the server.

export type LudoColor = "red" | "green" | "yellow" | "blue";

export type LudoSettings = {
  maxPlayers: 2 | 3 | 4;
  exitRolls: number[];
  extraTurnOnSix: boolean;
  extraTurnOnCapture: boolean;
  extraTurnOnHome: boolean;
  maxConsecutiveSixes: number;
  safeSquares: boolean;
  blockades: boolean;
  autoMove: boolean;
  turnSeconds: number;
  maxMissedTurns: number;
  endCondition: "first" | "all";
};

export type LudoSeat = { id: string; color: LudoColor; ready: boolean };

export type LudoGamePlayer = {
  id: string;
  color: LudoColor;
  status: "active" | "finished" | "left";
  missed: number;
  rank: number | null;
};

export type LudoTurn = {
  color: LudoColor;
  phase: "roll" | "move" | "over";
  dice: number | null;
  legal: number[];
  sixes: number;
  deadline: number | null;
};

export type LudoCapture = { color: LudoColor; token: number; from: number };

type EventBase = { seq: number; at: number };

export type LudoEvent =
  | (EventBase & { type: "start"; color: LudoColor })
  | (EventBase & {
      type: "roll";
      player: string;
      color: LudoColor;
      dice: number;
      sixes: number;
      auto: boolean;
      outcome: "move" | "no-moves" | "too-many-sixes";
      legal: number[];
      extraTurn?: "six" | null;
    })
  | (EventBase & {
      type: "move";
      player: string;
      color: LudoColor;
      token: number;
      from: number;
      to: number;
      dice: number;
      captures: LudoCapture[];
      home: boolean;
      finishedPlayer: boolean;
      extraTurn: "six" | "capture" | "home" | null;
      auto: boolean;
    })
  | (EventBase & { type: "skip"; player: string; color: LudoColor; reason: "timeout" })
  | (EventBase & { type: "leave"; player: string; color: LudoColor; reason: "left" | "inactive" })
  | (EventBase & { type: "end"; winner: string | null; ranking: string[] });

export type LudoTokens = Partial<Record<LudoColor, number[]>>;

export type LudoGame = {
  status: "playing" | "finished";
  settings: LudoSettings;
  players: LudoGamePlayer[];
  tokens: LudoTokens;
  turn: LudoTurn;
  turnNumber: number;
  winnerId: string | null;
  ranking: string[];
  eventSeq: number;
  events: LudoEvent[];
};

export type LudoRoomStatus = "waiting" | "playing" | "finished";

export type LudoRoom = {
  id: string;
  game: "ludo";
  hostId: string;
  players: string[];
  playerNames: Record<string, string>;
  playerColors: Record<string, string>;
  status: LudoRoomStatus;
  version: number;
  ludo: {
    settings: LudoSettings;
    seats: LudoSeat[];
    game: LudoGame | null;
    recentActions: { id: string; by: string }[];
  };
};

export type LudoAction =
  | { type: "join"; name: string }
  | { type: "ready"; ready: boolean }
  | { type: "color"; color: LudoColor }
  | { type: "settings"; maxPlayers?: 2 | 3 | 4; turnSeconds?: number }
  | { type: "start" }
  | { type: "roll" }
  | { type: "move"; token: number }
  | { type: "timeout" }
  | { type: "leave" }
  | { type: "restart" };
