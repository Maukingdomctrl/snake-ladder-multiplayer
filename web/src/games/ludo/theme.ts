import type { LudoColor } from "./types";

// Board and token colours. `text` is a darker shade that stays readable on
// white (names, labels); it matches the chat colours the server assigns.
export const PALETTE: Record<LudoColor, { base: string; dark: string; light: string; text: string }> = {
  red: { base: "#e5484d", dark: "#b3262c", light: "#fcdcdc", text: "#d6343a" },
  green: { base: "#2fa564", dark: "#1b7745", light: "#d3f0df", text: "#1a8a4a" },
  yellow: { base: "#f2c21b", dark: "#b88d00", light: "#fdf1c4", text: "#b98a00" },
  blue: { base: "#3b7ff2", dark: "#2256bd", light: "#d8e5fd", text: "#2a64c8" },
};
