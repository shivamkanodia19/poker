import { describe, expect, it } from "vitest";
import {
  applyAction,
  completeHand,
  createTable,
  deckHas52UniqueCards,
  evaluateSeven,
  getLegalActions,
  getPlayerPrivateSnapshot,
  getPlayerSnapshot,
  getPublicSnapshot,
  hydrateTable,
  seatPlayer,
  serializeTable,
  startHand
} from "../src/index.js";
import { createDeck } from "../src/cards.js";
import { compareRanks } from "../src/evaluator.js";
import type { LegalAction, TableState } from "../src/index.js";

function setup3(opts?: { stacks?: number[]; rng?: () => number }): TableState {
  const stacks = opts?.stacks ?? [200, 200, 200];
  const table = createTable({ tableId: "t", smallBlind: 5, bigBlind: 10, rng: opts?.rng ?? (() => 0.2) });
  seatPlayer(table, { playerId: "p1", displayName: "P1", stack: stacks[0], seatIndex: 0 });
  seatPlayer(table, { playerId: "p2", displayName: "P2", stack: stacks[1], seatIndex: 1 });
  seatPlayer(table, { playerId: "p3", displayName: "P3", stack: stacks[2], seatIndex: 2 });
  startHand(table);
  return table;
}

function totalChips(table: TableState): number {
  // Before showdown, in-flight chips live in committedTotal.
  // At showdown/handComplete, winnings are credited to stacks; committedTotal
  // is retained as historical audit data and must not be double-counted.
  if (table.phase === "showdown" || table.phase === "handComplete") {
    return table.seats.reduce((s, x) => s + x.stack, 0);
  }
  return table.seats.reduce((s, x) => s + x.stack + x.committedTotal, 0);
}

function legalTypes(legal: LegalAction[]): string[] {
  return legal.map((l) => l.type);
}

/* ================================================================== */
/* Deck + evaluator                                                    */
/* ================================================================== */

describe("deck", () => {
  it("builds a unique 52-card deck", () => {
    expect(deckHas52UniqueCards(createDeck())).toBe(true);
  });
});

describe("hand evaluator", () => {
  const rank = (...cards: Parameters<typeof evaluateSeven>[0]) => evaluateSeven(cards).rank;

  it("orders all rank categories", () => {
    const high = rank({ rank: "A", suit: "c" }, { rank: "K", suit: "d" }, { rank: "J", suit: "h" }, { rank: "9", suit: "s" }, { rank: "7", suit: "c" }, { rank: "4", suit: "d" }, { rank: "2", suit: "h" });
    const pair = rank({ rank: "A", suit: "c" }, { rank: "A", suit: "d" }, { rank: "J", suit: "h" }, { rank: "9", suit: "s" }, { rank: "7", suit: "c" }, { rank: "4", suit: "d" }, { rank: "2", suit: "h" });
    const twoPair = rank({ rank: "A", suit: "c" }, { rank: "A", suit: "d" }, { rank: "J", suit: "h" }, { rank: "J", suit: "s" }, { rank: "7", suit: "c" }, { rank: "4", suit: "d" }, { rank: "2", suit: "h" });
    const trips = rank({ rank: "A", suit: "c" }, { rank: "A", suit: "d" }, { rank: "A", suit: "h" }, { rank: "J", suit: "s" }, { rank: "7", suit: "c" }, { rank: "4", suit: "d" }, { rank: "2", suit: "h" });
    const straight = rank({ rank: "9", suit: "c" }, { rank: "8", suit: "d" }, { rank: "7", suit: "h" }, { rank: "6", suit: "s" }, { rank: "5", suit: "c" }, { rank: "2", suit: "d" }, { rank: "A", suit: "h" });
    const flush = rank({ rank: "A", suit: "h" }, { rank: "J", suit: "h" }, { rank: "9", suit: "h" }, { rank: "7", suit: "h" }, { rank: "3", suit: "h" }, { rank: "2", suit: "d" }, { rank: "K", suit: "c" });
    const fullHouse = rank({ rank: "K", suit: "c" }, { rank: "K", suit: "d" }, { rank: "K", suit: "h" }, { rank: "2", suit: "s" }, { rank: "2", suit: "c" }, { rank: "A", suit: "d" }, { rank: "Q", suit: "h" });
    const quads = rank({ rank: "9", suit: "c" }, { rank: "9", suit: "d" }, { rank: "9", suit: "h" }, { rank: "9", suit: "s" }, { rank: "2", suit: "c" }, { rank: "A", suit: "d" }, { rank: "Q", suit: "h" });
    const straightFlush = rank({ rank: "9", suit: "s" }, { rank: "8", suit: "s" }, { rank: "7", suit: "s" }, { rank: "6", suit: "s" }, { rank: "5", suit: "s" }, { rank: "2", suit: "d" }, { rank: "A", suit: "h" });
    const royal = rank({ rank: "A", suit: "s" }, { rank: "K", suit: "s" }, { rank: "Q", suit: "s" }, { rank: "J", suit: "s" }, { rank: "T", suit: "s" }, { rank: "2", suit: "d" }, { rank: "3", suit: "h" });
    expect(compareRanks(pair, high)).toBeGreaterThan(0);
    expect(compareRanks(twoPair, pair)).toBeGreaterThan(0);
    expect(compareRanks(trips, twoPair)).toBeGreaterThan(0);
    expect(compareRanks(straight, trips)).toBeGreaterThan(0);
    expect(compareRanks(flush, straight)).toBeGreaterThan(0);
    expect(compareRanks(fullHouse, flush)).toBeGreaterThan(0);
    expect(compareRanks(quads, fullHouse)).toBeGreaterThan(0);
    expect(compareRanks(straightFlush, quads)).toBeGreaterThan(0);
    expect(compareRanks(royal, straightFlush)).toBeGreaterThan(0);
  });

  it("wheel straight counts five-high straight", () => {
    const wheel = evaluateSeven([
      { rank: "A", suit: "c" },
      { rank: "2", suit: "d" },
      { rank: "3", suit: "h" },
      { rank: "4", suit: "s" },
      { rank: "5", suit: "c" },
      { rank: "K", suit: "d" },
      { rank: "Q", suit: "h" }
    ]).rank;
    expect(wheel.category).toBe(4);
    expect(wheel.kickers[0]).toBe(5);
  });

  it("ace-high straight beats king-high straight", () => {
    const aceHigh = evaluateSeven([
      { rank: "A", suit: "c" },
      { rank: "K", suit: "d" },
      { rank: "Q", suit: "h" },
      { rank: "J", suit: "s" },
      { rank: "T", suit: "c" },
      { rank: "2", suit: "d" },
      { rank: "3", suit: "h" }
    ]).rank;
    const kingHigh = evaluateSeven([
      { rank: "K", suit: "c" },
      { rank: "Q", suit: "d" },
      { rank: "J", suit: "h" },
      { rank: "T", suit: "s" },
      { rank: "9", suit: "c" },
      { rank: "2", suit: "d" },
      { rank: "3", suit: "h" }
    ]).rank;
    expect(aceHigh.category).toBe(4);
    expect(compareRanks(aceHigh, kingHigh)).toBeGreaterThan(0);
  });

  it("straight flush beats four of a kind", () => {
    const sf = evaluateSeven([
      { rank: "9", suit: "s" },
      { rank: "8", suit: "s" },
      { rank: "7", suit: "s" },
      { rank: "6", suit: "s" },
      { rank: "5", suit: "s" },
      { rank: "9", suit: "c" },
      { rank: "9", suit: "d" }
    ]).rank;
    const quads = evaluateSeven([
      { rank: "9", suit: "s" },
      { rank: "9", suit: "c" },
      { rank: "9", suit: "d" },
      { rank: "9", suit: "h" },
      { rank: "A", suit: "s" },
      { rank: "K", suit: "c" },
      { rank: "Q", suit: "d" }
    ]).rank;
    expect(sf.category).toBe(8);
    expect(compareRanks(sf, quads)).toBeGreaterThan(0);
  });

  it("full house picks higher trips and lower trips as pair", () => {
    const fh = evaluateSeven([
      { rank: "A", suit: "c" },
      { rank: "A", suit: "d" },
      { rank: "A", suit: "h" },
      { rank: "K", suit: "s" },
      { rank: "K", suit: "c" },
      { rank: "K", suit: "d" },
      { rank: "2", suit: "h" }
    ]).rank;
    expect(fh.category).toBe(6);
    expect(fh.kickers[0]).toBe(14);
    expect(fh.kickers[1]).toBe(13);
  });

  it("flush kicker comparison picks highest five of suit", () => {
    const a = evaluateSeven([
      { rank: "A", suit: "h" },
      { rank: "J", suit: "h" },
      { rank: "9", suit: "h" },
      { rank: "4", suit: "h" },
      { rank: "2", suit: "h" },
      { rank: "K", suit: "d" },
      { rank: "Q", suit: "c" }
    ]).rank;
    const b = evaluateSeven([
      { rank: "K", suit: "h" },
      { rank: "J", suit: "h" },
      { rank: "9", suit: "h" },
      { rank: "4", suit: "h" },
      { rank: "2", suit: "h" },
      { rank: "A", suit: "d" },
      { rank: "Q", suit: "c" }
    ]).rank;
    expect(compareRanks(a, b)).toBeGreaterThan(0);
  });

  it("board plays for both players => tie", () => {
    const community = [
      { rank: "A" as const, suit: "c" as const },
      { rank: "K" as const, suit: "d" as const },
      { rank: "Q" as const, suit: "h" as const },
      { rank: "J" as const, suit: "s" as const },
      { rank: "T" as const, suit: "c" as const }
    ];
    const a = evaluateSeven([...community, { rank: "2", suit: "d" }, { rank: "3", suit: "d" }]).rank;
    const b = evaluateSeven([...community, { rank: "4", suit: "s" }, { rank: "5", suit: "h" }]).rank;
    expect(compareRanks(a, b)).toBe(0);
  });

  it("kicker tie-breaking when pair is equal", () => {
    const a = evaluateSeven([
      { rank: "K", suit: "c" },
      { rank: "K", suit: "d" },
      { rank: "A", suit: "h" },
      { rank: "9", suit: "s" },
      { rank: "2", suit: "c" },
      { rank: "7", suit: "d" },
      { rank: "3", suit: "h" }
    ]).rank;
    const b = evaluateSeven([
      { rank: "K", suit: "s" },
      { rank: "K", suit: "h" },
      { rank: "Q", suit: "h" },
      { rank: "9", suit: "c" },
      { rank: "2", suit: "d" },
      { rank: "7", suit: "s" },
      { rank: "3", suit: "c" }
    ]).rank;
    expect(compareRanks(a, b)).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* Action order / blinds / button rotation                              */
/* ================================================================== */

describe("action order and blinds", () => {
  it("heads-up: dealer is SB and acts first preflop, BB acts first postflop", () => {
    const table = createTable({ tableId: "hu", smallBlind: 5, bigBlind: 10, rng: () => 0.1 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 100, seatIndex: 1 });
    startHand(table);
    const snap = getPublicSnapshot(table);
    expect(snap.dealerSeat).toBe(0);
    expect(snap.seats[0].committedThisStreet).toBe(5);
    expect(snap.seats[1].committedThisStreet).toBe(10);
    expect(snap.activeSeat).toBe(0);
    applyAction(table, { type: "call", playerId: "a" });
    applyAction(table, { type: "check", playerId: "b" });
    expect(getPublicSnapshot(table).phase).toBe("flop");
    expect(getPublicSnapshot(table).activeSeat).toBe(1);
  });

  it("3-player: UTG (seat left of BB) acts first preflop", () => {
    const table = setup3();
    expect(getPublicSnapshot(table).activeSeat).toBe(0);
  });

  it("postflop first to act is first active seat left of dealer", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    expect(getPublicSnapshot(table).phase).toBe("flop");
    expect(getPublicSnapshot(table).activeSeat).toBe(1);
  });

  it("dealer button rotates to next eligible seat", () => {
    const table = setup3();
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    startHand(table);
    expect(getPublicSnapshot(table).dealerSeat).toBe(1);
  });

  it("blinds and button skip sittingOut and busted seats", () => {
    const table = createTable({ tableId: "skip", smallBlind: 5, bigBlind: 10 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0, sittingOut: true });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 0, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 100, seatIndex: 2 });
    seatPlayer(table, { playerId: "d", displayName: "D", stack: 100, seatIndex: 3 });
    startHand(table);
    const snap = getPublicSnapshot(table);
    expect(snap.dealerSeat).toBe(2);
    expect(snap.seats[0].committedThisStreet).toBe(0);
    expect(snap.seats[1].committedThisStreet).toBe(0);
  });

  it("short-stack SB posts all remaining chips and becomes all-in", () => {
    const table = createTable({ tableId: "sb-short", smallBlind: 5, bigBlind: 10 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 3, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 100, seatIndex: 2 });
    startHand(table);
    // With 3 players, seat 0 is dealer, seat 1 is SB, seat 2 is BB. SB stack 3 goes all-in posting SB.
    expect(table.seats[1].stack).toBe(0);
    expect(table.seats[1].status).toBe("allIn");
    expect(table.seats[1].committedThisStreet).toBe(3);
  });
});

/* ================================================================== */
/* Min-raise rules                                                      */
/* ================================================================== */

describe("min-raise rules", () => {
  it("postflop bet 20 requires next raise target >= 40", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    // flop, p2 first. Check, then p3 bets 20.
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "bet", playerId: "p3", amount: 20 });
    const legal = getLegalActions(table, "p1");
    const raise = legal.find((l) => l.type === "raise");
    expect(raise?.minAmount).toBe(40);
    expect(() => applyAction(table, { type: "raise", playerId: "p1", amount: 30 })).toThrow();
    applyAction(table, { type: "raise", playerId: "p1", amount: 40 });
    expect(table.currentBet).toBe(40);
    expect(table.minRaise).toBe(20);
  });

  it("postflop bet 10 requires next raise target >= 20", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "bet", playerId: "p3", amount: 10 });
    const legal = getLegalActions(table, "p1");
    const raise = legal.find((l) => l.type === "raise");
    expect(raise?.minAmount).toBe(20);
  });

  it("raise 20 to 50 (raiseSize 30) makes next minRaiseTarget 80", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "bet", playerId: "p3", amount: 20 });
    applyAction(table, { type: "raise", playerId: "p1", amount: 50 });
    const legal = getLegalActions(table, "p2");
    const raise = legal.find((l) => l.type === "raise");
    expect(raise?.minAmount).toBe(80);
    expect(table.minRaise).toBe(30);
  });

  it("short all-in call-for-less does not reopen action", () => {
    const table = createTable({ tableId: "short2", smallBlind: 5, bigBlind: 10, rng: () => 0.1 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 200, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 25, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 200, seatIndex: 2 });
    startHand(table);
    // preflop: a raises to 40 (currentBet 40, minRaise 30). b is SB, committed 5.
    // Wait: seat 1 is SB (committed 5), seat 2 is BB (committed 10). a is seat 0, acts first with 3 players.
    applyAction(table, { type: "raise", playerId: "a", amount: 40 });
    // b facing 40, stack only 25 - 5 committed already? No, b.stack=25 - 5 = 20, b.committedThisStreet=5.
    // b all-in: commits remaining 20, target = 5+20=25. 25 <= currentBet=40, call-for-less.
    applyAction(table, { type: "allIn", playerId: "b" });
    expect(table.currentBet).toBe(40);
    expect(table.minRaise).toBe(30);
    // Action should move to c. If reopened, c could re-raise with minRaise=30. If not reopened, after c calls, action completes.
    applyAction(table, { type: "call", playerId: "c" });
    // Betting round complete → flop dealt.
    expect(getPublicSnapshot(table).phase).toBe("flop");
  });

  it("short all-in raise does not reopen action to prior bettors or callers", () => {
    const table = setup3({ stacks: [160, 500, 500] });
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });

    applyAction(table, { type: "bet", playerId: "p2", amount: 100 });
    applyAction(table, { type: "call", playerId: "p3" });
    applyAction(table, { type: "allIn", playerId: "p1" });

    expect(table.currentBet).toBe(150);
    expect(table.minRaise).toBe(100);
    expect(legalTypes(getLegalActions(table, "p2"))).not.toContain("raise");
    expect(() => applyAction(table, { type: "raise", playerId: "p2", amount: 250 })).toThrow();

    applyAction(table, { type: "call", playerId: "p2" });
    expect(legalTypes(getLegalActions(table, "p3"))).not.toContain("raise");
    applyAction(table, { type: "call", playerId: "p3" });
    expect(getPublicSnapshot(table).phase).toBe("turn");
  });

  it("short all-in opening bet below the blind can only be completed to a full minimum bet", () => {
    const table = setup3({ stacks: [200, 13, 200] });
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });

    applyAction(table, { type: "allIn", playerId: "p2" });
    expect(table.currentBet).toBe(3);
    expect(table.minRaise).toBe(10);

    const raise = getLegalActions(table, "p3").find((l) => l.type === "raise");
    expect(raise?.minAmount).toBe(10);
    expect(() => applyAction(table, { type: "raise", playerId: "p3", amount: 6 })).toThrow();
    applyAction(table, { type: "raise", playerId: "p3", amount: 10 });
    expect(table.currentBet).toBe(10);
    expect(table.minRaise).toBe(10);
  });

  it("full all-in raise reopens action", () => {
    const table = createTable({ tableId: "full", smallBlind: 5, bigBlind: 10, rng: () => 0.1 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 300, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 120, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 300, seatIndex: 2 });
    startHand(table);
    applyAction(table, { type: "raise", playerId: "a", amount: 40 });
    applyAction(table, { type: "allIn", playerId: "b" });
    // b raises to 120, raiseSize=80, >= minRaise 30 → full raise. Action reopens for a.
    applyAction(table, { type: "fold", playerId: "c" });
    const legalA = legalTypes(getLegalActions(table, "a"));
    expect(legalA).toContain("raise");
  });

  it("all-in below min raise is not a legal 'raise' but is legal via 'allIn'", () => {
    const table = createTable({ tableId: "below", smallBlind: 5, bigBlind: 10, rng: () => 0.1 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 200, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 25, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 200, seatIndex: 2 });
    startHand(table);
    // preflop: a acts first, currentBet=10, minRaise=10
    applyAction(table, { type: "raise", playerId: "a", amount: 40 });
    // For b facing 40 to call, stack 25 → can't call fully. Legal: fold, call (for 25), allIn.
    const legalB = legalTypes(getLegalActions(table, "b"));
    expect(legalB).not.toContain("raise");
    expect(legalB).toContain("allIn");
    expect(() => applyAction(table, { type: "raise", playerId: "b", amount: 25 })).toThrow();
    applyAction(table, { type: "allIn", playerId: "b" });
  });
});

/* ================================================================== */
/* Showdown / side pots / chip conservation                             */
/* ================================================================== */

describe("showdown and settlement", () => {
  it("side pots ignore folded players; chips conserved", () => {
    const table = createTable({ tableId: "side", smallBlind: 1, bigBlind: 2 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 60, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 30, seatIndex: 2 });
    startHand(table);
    const initial = totalChips(table);
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "fold", playerId: "b" });
    applyAction(table, { type: "allIn", playerId: "c" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("showdown");
    expect(snap.sidePots.length).toBeGreaterThan(0);
    for (const pot of snap.sidePots) {
      expect(pot.winnerSeatIndexes).not.toContain(1);
    }
    expect(totalChips(table)).toBe(initial);
  });

  it("showdown reveals all-in losers' cards and potTotal equals resolved pot", () => {
    const table = createTable({ tableId: "allIn2", smallBlind: 5, bigBlind: 10, rng: () => 0.5 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 100, seatIndex: 1 });
    startHand(table);
    const before = totalChips(table);
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "call", playerId: "b" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("showdown");
    expect(snap.seats[0].cards?.length).toBe(2);
    expect(snap.seats[1].cards?.length).toBe(2);
    const payoutTotal = snap.payoutSummary.reduce((s, p) => s + p.amount, 0);
    expect(payoutTotal).toBe(snap.potTotal);
    expect(totalChips(table)).toBe(before);
  });

  it("folded cards stay hidden even at showdown", () => {
    const table = setup3({ rng: () => 0.3 });
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "allIn", playerId: "p2" });
    applyAction(table, { type: "allIn", playerId: "p3" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("showdown");
    expect(snap.seats[0].cards).toBeUndefined();
    expect(snap.seats[1].cards?.length).toBe(2);
    expect(snap.seats[2].cards?.length).toBe(2);
  });

  it("cards clear only after completeHand, not at showdown", () => {
    const table = createTable({ tableId: "clear", smallBlind: 5, bigBlind: 10, rng: () => 0.4 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 100, seatIndex: 1 });
    startHand(table);
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "call", playerId: "b" });
    const showdown = getPublicSnapshot(table);
    expect(showdown.phase).toBe("showdown");
    expect(showdown.seats[0].cards?.length).toBe(2);
    expect(showdown.communityCards).toHaveLength(5);
    const potAtShowdown = showdown.potTotal;
    expect(potAtShowdown).toBeGreaterThan(0);
    completeHand(table);
    const complete = getPublicSnapshot(table);
    expect(complete.phase).toBe("handComplete");
    expect(complete.seats[0].cards).toBeUndefined();
    expect(complete.seats[1].cards).toBeUndefined();
    expect(complete.communityCards).toHaveLength(0);
    expect(complete.payoutSummary.length).toBeGreaterThan(0);
  });

  it("board-plays tie splits pot evenly", () => {
    const table = createTable({ tableId: "tie", smallBlind: 5, bigBlind: 10, rng: () => 0.4 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 100, seatIndex: 1 });
    startHand(table);
    // Engineer a tie: both play the royal straight on the board.
    table.seats[0].cards = [{ rank: "2", suit: "c" }, { rank: "3", suit: "d" }];
    table.seats[1].cards = [{ rank: "4", suit: "h" }, { rank: "5", suit: "s" }];
    table.deck = [
      { rank: "2", suit: "s" },
      { rank: "A", suit: "c" },
      { rank: "K", suit: "d" },
      { rank: "Q", suit: "h" },
      { rank: "3", suit: "s" },
      { rank: "J", suit: "s" },
      { rank: "4", suit: "s" },
      { rank: "T", suit: "c" },
      ...table.deck
    ];
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "call", playerId: "b" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("showdown");
    expect(snap.winningSeatIndexes).toEqual([0, 1]);
    const amounts = snap.payoutSummary.map((p) => p.amount).sort();
    expect(amounts).toEqual([100, 100]);
  });

  it("three-way all-in creates proper main and side pots", () => {
    const table = createTable({ tableId: "3sp", smallBlind: 1, bigBlind: 2 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 20, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 50, seatIndex: 1 });
    seatPlayer(table, { playerId: "c", displayName: "C", stack: 100, seatIndex: 2 });
    startHand(table);
    const before = totalChips(table);
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "allIn", playerId: "b" });
    applyAction(table, { type: "call", playerId: "c" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("showdown");
    expect(snap.sidePots.length).toBeGreaterThanOrEqual(2);
    const sum = snap.sidePots.reduce((s, p) => s + p.amount, 0);
    expect(sum).toBe(snap.potTotal);
    expect(totalChips(table)).toBe(before);
  });
});

/* ================================================================== */
/* Uncontested hand cleanup                                             */
/* ================================================================== */

describe("uncontested hand cleanup", () => {
  it("everyone folds to one player: hand completes with payout and clean state", () => {
    const table = setup3();
    const before = totalChips(table);
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("handComplete");
    expect(snap.payoutSummary.length).toBe(1);
    expect(snap.payoutSummary[0].playerId).toBe("p3");
    expect(snap.winningSeatIndexes).toEqual([2]);
    expect(snap.communityCards).toHaveLength(0);
    for (const seat of snap.seats) {
      expect(seat.cards).toBeUndefined();
      expect(seat.committedThisStreet).toBe(0);
      expect(seat.committedTotal).toBe(0);
    }
    expect(totalChips(table)).toBe(before);
  });

  it("private snapshot has no cards after uncontested hand", () => {
    const table = setup3();
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    const priv = getPlayerPrivateSnapshot(table, "p3");
    expect(priv.cards).toEqual([]);
  });

  it("next hand after uncontested pot starts clean", () => {
    const table = setup3();
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    startHand(table);
    const snap = getPublicSnapshot(table);
    expect(snap.phase).toBe("preflop");
    expect(snap.communityCards).toHaveLength(0);
    expect(snap.handHistory.some((h) => h.includes("hand 2 started"))).toBe(true);
  });
});

/* ================================================================== */
/* Snapshot invariants                                                  */
/* ================================================================== */

describe("snapshot invariants", () => {
  it("public hides cards; private reveals only viewer's cards", () => {
    const table = setup3();
    const pub = getPublicSnapshot(table);
    expect(pub.seats[0].cards).toBeUndefined();
    const p1 = getPlayerSnapshot(table, "p1");
    expect(p1.seats[0].cards?.length).toBe(2);
    expect(p1.seats[1].cards).toBeUndefined();
    const priv = getPlayerPrivateSnapshot(table, "p1");
    expect(priv.cards.length).toBe(2);
  });

  it("legalActionsByPlayerId has non-empty actions only for active player", () => {
    const table = setup3();
    const snap = getPublicSnapshot(table);
    for (const [pid, actions] of Object.entries(snap.legalActionsByPlayerId)) {
      const seat = snap.seats.find((s) => s.playerId === pid)!;
      if (seat.seatIndex === snap.activeSeat) {
        expect(actions.length).toBeGreaterThan(0);
      } else {
        expect(actions).toEqual([]);
      }
    }
  });

  it("potTotal equals sum of committedTotal mid-hand", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    const snap = getPublicSnapshot(table);
    const sum = snap.seats.reduce((s, x) => s + x.committedTotal, 0);
    expect(snap.potTotal).toBe(sum);
  });

  it("currentBet is bigBlind preflop and 0 postflop after all checks", () => {
    const table = setup3();
    expect(getPublicSnapshot(table).currentBet).toBe(10);
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    expect(getPublicSnapshot(table).currentBet).toBe(0);
  });

  it("showdown snapshot exposes summary and cards, handComplete clears cards but keeps summary", () => {
    const table = createTable({ tableId: "sd", smallBlind: 5, bigBlind: 10, rng: () => 0.4 });
    seatPlayer(table, { playerId: "a", displayName: "A", stack: 100, seatIndex: 0 });
    seatPlayer(table, { playerId: "b", displayName: "B", stack: 100, seatIndex: 1 });
    startHand(table);
    applyAction(table, { type: "allIn", playerId: "a" });
    applyAction(table, { type: "call", playerId: "b" });
    const sd = getPublicSnapshot(table);
    expect(sd.showdownSummary).toBeDefined();
    expect(sd.showdownSeatIndexes.length).toBe(2);
    completeHand(table);
    const done = getPublicSnapshot(table);
    expect(done.showdownSummary).toBeDefined();
    expect(done.payoutSummary.length).toBeGreaterThan(0);
    for (const s of done.seats) expect(s.cards).toBeUndefined();
  });
});

/* ================================================================== */
/* Illegal action handling                                              */
/* ================================================================== */

describe("illegal actions", () => {
  it("rejects out-of-turn, post-fold, illegal check, and tiny raise", () => {
    const table = setup3();
    expect(() => applyAction(table, { type: "call", playerId: "p2" })).toThrow();
    expect(() => applyAction(table, { type: "check", playerId: "p1" })).toThrow();
    expect(() => applyAction(table, { type: "raise", playerId: "p1", amount: 15 })).toThrow();
    applyAction(table, { type: "fold", playerId: "p1" });
    expect(() => applyAction(table, { type: "call", playerId: "p1" })).toThrow();
  });
});

/* ================================================================== */
/* Serialization / hydration                                            */
/* ================================================================== */

describe("serialization and hydration", () => {
  it("serialize/hydrate preserves state and can continue hand", () => {
    const table = setup3();
    applyAction(table, { type: "call", playerId: "p1" });
    const copy = hydrateTable(serializeTable(table), { rng: () => 0.9 });
    expect(getPublicSnapshot(copy).phase).toBe("preflop");
    applyAction(copy, { type: "call", playerId: "p2" });
    applyAction(copy, { type: "check", playerId: "p3" });
    expect(getPublicSnapshot(copy).phase).toBe("flop");
  });

  it("serialize/hydrate after handComplete allows starting a new hand", () => {
    const table = setup3();
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    const copy = hydrateTable(serializeTable(table), { rng: () => 0.3 });
    startHand(copy);
    expect(getPublicSnapshot(copy).phase).toBe("preflop");
  });

  it("hydrate rejects malformed JSON", () => {
    expect(() => hydrateTable("not json")).toThrow();
  });

  it("hydrate rejects missing required fields", () => {
    expect(() => hydrateTable(JSON.stringify({ version: 1 }))).toThrow();
  });

  it("hydrate rejects wrong version", () => {
    expect(() => hydrateTable(JSON.stringify({ version: 99, tableId: "x" }))).toThrow();
  });

  it("serialized data contains no functions (JSON-safe)", () => {
    const table = setup3();
    const raw = serializeTable(table);
    const parsed = JSON.parse(raw);
    expect(typeof parsed.rng).toBe("undefined");
  });

  it("hydrate accepts injected RNG for next hand", () => {
    const table = setup3();
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    const rng = () => 0.123;
    const copy = hydrateTable(serializeTable(table), { rng });
    startHand(copy);
    expect(copy.rng).toBe(rng);
  });
});

/* ================================================================== */
/* End-to-end hand flows                                                */
/* ================================================================== */

describe("end-to-end hand flows", () => {
  it("runs preflop → flop → turn → river → showdown → handComplete", () => {
    const table = setup3({ rng: () => 0.42 });
    const before = totalChips(table);
    applyAction(table, { type: "call", playerId: "p1" });
    applyAction(table, { type: "call", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    // flop
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    applyAction(table, { type: "check", playerId: "p1" });
    // turn
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    applyAction(table, { type: "check", playerId: "p1" });
    // river
    applyAction(table, { type: "check", playerId: "p2" });
    applyAction(table, { type: "check", playerId: "p3" });
    applyAction(table, { type: "check", playerId: "p1" });
    expect(getPublicSnapshot(table).phase).toBe("showdown");
    completeHand(table);
    expect(getPublicSnapshot(table).phase).toBe("handComplete");
    expect(totalChips(table)).toBe(before);
  });

  it("chips conserved across consecutive hands", () => {
    const table = setup3({ rng: () => 0.7 });
    const before = totalChips(table);
    applyAction(table, { type: "fold", playerId: "p1" });
    applyAction(table, { type: "fold", playerId: "p2" });
    expect(totalChips(table)).toBe(before);
    startHand(table);
    applyAction(table, { type: "fold", playerId: "p2" });
    applyAction(table, { type: "fold", playerId: "p3" });
    expect(totalChips(table)).toBe(before);
  });
});
