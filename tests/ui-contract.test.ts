import { describe, expect, it } from "vitest";
import * as UI from "../src/ui-contract/index.js";
import type { GameSnapshot } from "../src/ui-contract/index.js";

function sumCommittedTotal(snap: GameSnapshot): number {
  return snap.seats.reduce((sum, s) => sum + s.committedTotal, 0);
}

function assertFixtureInvariants(snap: GameSnapshot): void {
  // Stacks are never negative
  for (const s of snap.seats) {
    expect(s.stack).toBeGreaterThanOrEqual(0);
    expect(s.committedThisStreet).toBeGreaterThanOrEqual(0);
    expect(s.committedTotal).toBeGreaterThanOrEqual(0);
  }

  // legalActionsByPlayerId: only active seat has non-empty actions
  for (const [pid, actions] of Object.entries(snap.legalActionsByPlayerId)) {
    const seat = snap.seats.find((s) => s.playerId === pid);
    if (!seat) continue;
    if (seat.seatIndex === snap.activeSeat) {
      expect(actions.length).toBeGreaterThan(0);
    } else {
      expect(actions).toEqual([]);
    }
  }

  // Pot total matches committed totals (live) or resolved payouts (showdown/handComplete)
  if (snap.phase === "showdown" || snap.phase === "handComplete") {
    const payoutTotal = snap.payoutSummary.reduce((s, p) => s + p.amount, 0);
    if (payoutTotal > 0) {
      expect(snap.potTotal).toBe(payoutTotal);
    }
    if (snap.sidePots.length > 0) {
      const sidePotTotal = snap.sidePots.reduce((s, p) => s + p.amount, 0);
      expect(sidePotTotal).toBe(snap.potTotal);
    }
  } else {
    expect(snap.potTotal).toBe(sumCommittedTotal(snap));
  }

  // Community card counts match phase
  const expectedBoard: Record<string, number> = {
    waiting: 0,
    preflop: 0,
    flop: 3,
    turn: 4,
    river: 5,
    showdown: 5,
    handComplete: 0
  };
  expect(snap.communityCards.length).toBe(expectedBoard[snap.phase]);

  // Showdown reveals cards only for eligible seats
  if (snap.phase === "showdown") {
    const revealed = new Set(snap.showdownSeatIndexes);
    for (const s of snap.seats) {
      if (revealed.has(s.seatIndex)) {
        expect(s.cards?.length).toBe(2);
      } else {
        expect(s.cards).toBeUndefined();
      }
    }
  }

  // handComplete hides private cards
  if (snap.phase === "handComplete") {
    for (const s of snap.seats) expect(s.cards).toBeUndefined();
  }
}

describe("ui contract fixtures", () => {
  it("exports required snapshots with correct phases", () => {
    expect(UI.waiting.phase).toBe("waiting");
    expect(UI.preflopFacingCall.phase).toBe("preflop");
    expect(UI.flopFacingBet.phase).toBe("flop");
    expect(UI.turnAllIn.phase).toBe("turn");
    expect(UI.river.phase).toBe("river");
    expect(UI.showdown.phase).toBe("showdown");
    expect(UI.handComplete.phase).toBe("handComplete");
    expect(UI.playerSittingOut.seats.some((s) => s.status === "sittingOut")).toBe(true);
    expect(UI.bustedPlayer.seats.some((s) => s.status === "busted")).toBe(true);
  });

  it("sample snapshots and private snapshot are ui-safe", () => {
    expect(UI.sampleSnapshots.showdown.showdownSummary?.winningSeatIndexes.length).toBeGreaterThan(0);
    expect(UI.samplePrivateSnapshot.cards.length).toBe(2);
  });

  it("every fixture satisfies invariants", () => {
    for (const snap of Object.values(UI.sampleSnapshots)) {
      assertFixtureInvariants(snap);
    }
  });
});
