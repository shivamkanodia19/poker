#!/usr/bin/env node
/**
 * Verify that the built dist package is importable by Node and that
 * core engine functions work end-to-end from the compiled output.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const distEntry = pathToFileURL(resolve(process.cwd(), "dist/index.js")).href;
const engine = await import(distEntry);

assert.equal(typeof engine.createTable, "function", "createTable must be exported");
assert.equal(typeof engine.seatPlayer, "function", "seatPlayer must be exported");
assert.equal(typeof engine.startHand, "function", "startHand must be exported");
assert.equal(typeof engine.applyAction, "function", "applyAction must be exported");
assert.equal(typeof engine.getPublicSnapshot, "function", "getPublicSnapshot must be exported");
assert.equal(typeof engine.completeHand, "function", "completeHand must be exported");
assert.equal(typeof engine.serializeTable, "function", "serializeTable must be exported");
assert.equal(typeof engine.hydrateTable, "function", "hydrateTable must be exported");
assert.equal(typeof engine.simulateDemoHand, "function", "simulateDemoHand must be exported");

const table = engine.createTable({
  tableId: "verify",
  smallBlind: 5,
  bigBlind: 10,
  rng: () => 0.42
});
engine.seatPlayer(table, { playerId: "a", displayName: "A", stack: 200, seatIndex: 0 });
engine.seatPlayer(table, { playerId: "b", displayName: "B", stack: 200, seatIndex: 1 });
engine.seatPlayer(table, { playerId: "c", displayName: "C", stack: 200, seatIndex: 2 });
engine.startHand(table);

const snap = engine.getPublicSnapshot(table);
assert.equal(snap.phase, "preflop", "expected preflop after startHand");
assert.equal(snap.seats.filter((s) => s.playerId).length, 3, "expected 3 seated players");

engine.applyAction(table, { type: "fold", playerId: "a" });
engine.applyAction(table, { type: "fold", playerId: "b" });
const done = engine.getPublicSnapshot(table);
assert.equal(done.phase, "handComplete", "expected handComplete after folds");
assert.equal(done.payoutSummary.length, 1, "expected a single payout");

const hands = engine.simulateDemoHand(42);
assert.ok(hands.length > 0, "simulateDemoHand should produce snapshots");
assert.equal(hands[hands.length - 1].phase, "handComplete", "demo hand ends at handComplete");

console.log("dist import verified: all checks passed");
