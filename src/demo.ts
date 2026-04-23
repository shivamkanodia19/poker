import { applyAction, completeHand, createTable, getPublicSnapshot, seatPlayer, startHand } from "./engine.js";
import type { GameSnapshot } from "./types.js";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateDemoHand(seed = 42): GameSnapshot[] {
  const rng = mulberry32(seed);
  const table = createTable({ tableId: "demo-table", smallBlind: 5, bigBlind: 10, rng });
  seatPlayer(table, { playerId: "p1", displayName: "Alice", stack: 500, seatIndex: 0 });
  seatPlayer(table, { playerId: "p2", displayName: "Bob", stack: 500, seatIndex: 1 });
  seatPlayer(table, { playerId: "p3", displayName: "Carol", stack: 500, seatIndex: 2 });

  const snapshots: GameSnapshot[] = [];
  startHand(table);
  snapshots.push(getPublicSnapshot(table));

  applyAction(table, { type: "call", playerId: "p1" });
  snapshots.push(getPublicSnapshot(table));
  applyAction(table, { type: "call", playerId: "p2" });
  snapshots.push(getPublicSnapshot(table));
  applyAction(table, { type: "check", playerId: "p3" });
  snapshots.push(getPublicSnapshot(table));

  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "bet", playerId: "p3", amount: 20 });
  applyAction(table, { type: "call", playerId: "p1" });
  applyAction(table, { type: "call", playerId: "p2" });
  snapshots.push(getPublicSnapshot(table));

  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  applyAction(table, { type: "check", playerId: "p1" });
  snapshots.push(getPublicSnapshot(table));

  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  applyAction(table, { type: "check", playerId: "p1" });
  snapshots.push(getPublicSnapshot(table));

  completeHand(table);
  snapshots.push(getPublicSnapshot(table));
  return snapshots;
}

export function createDemoSnapshots(): GameSnapshot[] {
  return simulateDemoHand(42);
}
