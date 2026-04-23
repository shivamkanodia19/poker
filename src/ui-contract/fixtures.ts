import {
  applyAction,
  completeHand,
  createTable,
  getPlayerPrivateSnapshot,
  getPublicSnapshot,
  seatPlayer,
  startHand
} from "../engine.js";
import type { GameSnapshot, PlayerPrivateSnapshot, TableState } from "../types.js";

/** Deterministic seeded RNG for reproducible fixtures. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function baseTable(seed: number, stacks: number[] = [1000, 1000, 1000]): TableState {
  const rng = mulberry32(seed);
  const table = createTable({
    tableId: "table-fixture",
    smallBlind: 5,
    bigBlind: 10,
    rng,
    maxPlayers: 6
  });
  const names = ["Alice", "Bob", "Carol"];
  const ids = ["p1", "p2", "p3"];
  for (let i = 0; i < stacks.length; i += 1) {
    seatPlayer(table, { playerId: ids[i], displayName: names[i], stack: stacks[i], seatIndex: i });
  }
  return table;
}

/* ------------------------------------------------------------------ */
/* Public fixtures                                                     */
/* ------------------------------------------------------------------ */

function buildWaiting(): GameSnapshot {
  return getPublicSnapshot(baseTable(1));
}

function buildPreflopFacingCall(): GameSnapshot {
  const table = baseTable(2);
  startHand(table);
  return getPublicSnapshot(table);
}

function buildFlopFacingBet(): GameSnapshot {
  const table = baseTable(3);
  startHand(table);
  // Preflop: Alice (utg), Bob (SB), Carol (BB). First to act = Alice, then Bob, then Carol.
  applyAction(table, { type: "call", playerId: "p1" });
  applyAction(table, { type: "call", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  // Flop: first to act = Bob (seat 1 — left of dealer seat 0).
  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "bet", playerId: "p3", amount: 20 });
  return getPublicSnapshot(table);
}

function buildTurnAllIn(): GameSnapshot {
  // Need exactly one active player still to act on the turn, facing an all-in.
  // Use short stacks so we can engineer an all-in on the turn.
  const table = baseTable(4, [300, 300, 300]);
  startHand(table);
  // Preflop: all call.
  applyAction(table, { type: "call", playerId: "p1" });
  applyAction(table, { type: "call", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  // Flop: check, bet 40, call, call.
  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "bet", playerId: "p3", amount: 40 });
  applyAction(table, { type: "call", playerId: "p1" });
  applyAction(table, { type: "call", playerId: "p2" });
  // Turn: Bob checks, Carol goes all-in. Active becomes Alice, facing all-in.
  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "allIn", playerId: "p3" });
  return getPublicSnapshot(table);
}

function buildRiver(): GameSnapshot {
  const table = baseTable(5);
  startHand(table);
  applyAction(table, { type: "call", playerId: "p1" });
  applyAction(table, { type: "call", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  // Flop: all check.
  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  applyAction(table, { type: "check", playerId: "p1" });
  // Turn: all check.
  applyAction(table, { type: "check", playerId: "p2" });
  applyAction(table, { type: "check", playerId: "p3" });
  applyAction(table, { type: "check", playerId: "p1" });
  // Now on river, first to act = Bob.
  return getPublicSnapshot(table);
}

function buildShowdown(): GameSnapshot {
  // Everyone all-in preflop → auto runout to showdown.
  const table = baseTable(6, [200, 200, 200]);
  startHand(table);
  applyAction(table, { type: "allIn", playerId: "p1" });
  applyAction(table, { type: "allIn", playerId: "p2" });
  applyAction(table, { type: "allIn", playerId: "p3" });
  return getPublicSnapshot(table);
}

function buildHandComplete(): GameSnapshot {
  const table = baseTable(6, [200, 200, 200]);
  startHand(table);
  applyAction(table, { type: "allIn", playerId: "p1" });
  applyAction(table, { type: "allIn", playerId: "p2" });
  applyAction(table, { type: "allIn", playerId: "p3" });
  completeHand(table);
  return getPublicSnapshot(table);
}

function buildPlayerSittingOut(): GameSnapshot {
  const rng = mulberry32(7);
  const table = createTable({
    tableId: "table-fixture",
    smallBlind: 5,
    bigBlind: 10,
    rng,
    maxPlayers: 6
  });
  seatPlayer(table, { playerId: "p1", displayName: "Alice", stack: 1000, seatIndex: 0, sittingOut: true });
  seatPlayer(table, { playerId: "p2", displayName: "Bob", stack: 1000, seatIndex: 1 });
  seatPlayer(table, { playerId: "p3", displayName: "Carol", stack: 1000, seatIndex: 2 });
  return getPublicSnapshot(table);
}

function buildBustedPlayer(): GameSnapshot {
  const rng = mulberry32(8);
  const table = createTable({
    tableId: "table-fixture",
    smallBlind: 5,
    bigBlind: 10,
    rng,
    maxPlayers: 6
  });
  seatPlayer(table, { playerId: "p1", displayName: "Alice", stack: 0, seatIndex: 0 });
  seatPlayer(table, { playerId: "p2", displayName: "Bob", stack: 1000, seatIndex: 1 });
  seatPlayer(table, { playerId: "p3", displayName: "Carol", stack: 1000, seatIndex: 2 });
  return getPublicSnapshot(table);
}

function buildPrivateSnapshot(): PlayerPrivateSnapshot {
  const table = baseTable(2);
  startHand(table);
  return getPlayerPrivateSnapshot(table, "p1");
}

export const waiting: GameSnapshot = buildWaiting();
export const preflopFacingCall: GameSnapshot = buildPreflopFacingCall();
export const flopFacingBet: GameSnapshot = buildFlopFacingBet();
export const turnAllIn: GameSnapshot = buildTurnAllIn();
export const river: GameSnapshot = buildRiver();
export const showdown: GameSnapshot = buildShowdown();
export const handComplete: GameSnapshot = buildHandComplete();
export const playerSittingOut: GameSnapshot = buildPlayerSittingOut();
export const bustedPlayer: GameSnapshot = buildBustedPlayer();
export const privatePlayerSnapshot: PlayerPrivateSnapshot = buildPrivateSnapshot();
