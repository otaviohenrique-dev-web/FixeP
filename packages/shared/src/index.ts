// Simulação em grade ortogonal (servidor). Isométrico é só projeção no cliente.
export const MAP_W = 40;
export const MAP_H = 40;
export const TICK_RATE = 20; // Hz
export const MOVE_SPEED = 4; // tiles/s
export const MAX_CLIENTS_PER_ZONE = 50;

export const Msg = {
  MoveTo: "move_to",
} as const;

export interface MoveToPayload {
  x: number; // tile
  y: number;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
