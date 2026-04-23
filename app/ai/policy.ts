import type { Card, GameSnapshot, LegalAction, Rank } from "@engine";
import { evaluateSeven, compareRanks } from "@engine";

/**
 * Heuristic heads-up NLHE-style bot policy.
 *
 * Preflop: Chen-like strength score → fold / call / raise thresholds.
 * Postflop: simple made-hand category lookup → fold / check / call / bet thresholds.
 * No Monte Carlo yet (kept cheap to run on-device); good enough for casual play.
 */
export type BotContext = {
  playerId: string;
  holeCards: Card[];
  snapshot: GameSnapshot;
  legal: LegalAction[];
  rng: () => number;
};

export type BotDecision = {
  type: "fold" | "check" | "call" | "bet" | "raise" | "allIn";
  amount?: number;
};

const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14
};

export function decide(ctx: BotContext): BotDecision {
  const { snapshot, legal, holeCards, rng } = ctx;
  if (legal.length === 0) return { type: "fold" };

  const isPreflop = snapshot.phase === "preflop";
  if (isPreflop) return decidePreflop(ctx);
  return decidePostflop(holeCards, snapshot, legal, rng);
}

function decidePreflop(ctx: BotContext): BotDecision {
  const { holeCards, legal, snapshot, rng } = ctx;
  const score = preflopScore(holeCards);

  const canCheck = has(legal, "check");
  const call = find(legal, "call");
  const raise = find(legal, "raise");
  const bet = find(legal, "bet");
  const fold = has(legal, "fold");

  // tighten/loosen with a little randomness
  const jitter = rng() * 0.15 - 0.075;
  const strength = score + jitter;

  if (canCheck) {
    // Free preflop — mix in some steal raises with premiums.
    if (raise && strength > 0.6 && rng() < 0.7) {
      const target = raiseSize(snapshot, raise, 2.5);
      return { type: "raise", amount: target };
    }
    if (bet && strength > 0.8 && rng() < 0.5) {
      return { type: "bet", amount: Math.min(bet.maxAmount ?? snapshot.bigBlind * 3, snapshot.bigBlind * 3) };
    }
    return { type: "check" };
  }

  // Facing a bet preflop.
  if (!call) return fold ? { type: "fold" } : { type: "check" };

  if (strength > 0.85 && raise) {
    const target = raiseSize(snapshot, raise, 3);
    return { type: "raise", amount: target };
  }
  if (strength > 0.55) {
    return { type: "call", amount: call.minAmount };
  }
  if (strength > 0.35 && rng() < 0.4) {
    return { type: "call", amount: call.minAmount };
  }
  return fold ? { type: "fold" } : { type: "call", amount: call.minAmount };
}

function decidePostflop(
  hole: Card[],
  snap: GameSnapshot,
  legal: LegalAction[],
  rng: () => number
): BotDecision {
  const board = snap.communityCards;
  const canCheck = has(legal, "check");
  const call = find(legal, "call");
  const raise = find(legal, "raise");
  const bet = find(legal, "bet");
  const fold = has(legal, "fold");

  // Evaluate made hand strength.
  const evalResult = evaluateSeven([...hole, ...board]);
  const category = evalResult.rank.category; // 0..8

  // Rough strength score 0..1 from category and top kicker.
  const topKicker = evalResult.rank.kickers[0] ?? 0;
  const base = Math.min(1, category / 6 + (topKicker / 14) * 0.1);
  const strength = Math.min(1, Math.max(0, base + (rng() * 0.1 - 0.05)));

  // Draw awareness (very light): suited two hole + 2 on board of same suit = flush draw.
  const flushDraw = hasFlushDraw(hole, board);
  const straightDraw = hasOpenEnderOrGutshot(hole, board);
  const drawBonus = (flushDraw ? 0.12 : 0) + (straightDraw ? 0.08 : 0);

  const effectiveStrength = Math.min(1, strength + drawBonus);

  if (canCheck) {
    if (bet && effectiveStrength > 0.55) {
      const potSized = Math.floor(snap.potTotal * (0.5 + rng() * 0.4));
      const target = clamp(potSized, bet.minAmount ?? snap.bigBlind, bet.maxAmount ?? potSized);
      return { type: "bet", amount: target };
    }
    if (bet && effectiveStrength > 0.35 && rng() < 0.3) {
      const target = clamp(Math.floor(snap.potTotal * 0.4), bet.minAmount ?? snap.bigBlind, bet.maxAmount ?? snap.potTotal);
      return { type: "bet", amount: target };
    }
    return { type: "check" };
  }

  // Facing a bet postflop.
  if (!call) return fold ? { type: "fold" } : { type: "check" };

  // Rough pot odds: call.minAmount / (pot + call.minAmount).
  const toCall = call.minAmount ?? 0;
  const potOdds = toCall > 0 ? toCall / (snap.potTotal + toCall) : 0;

  if (effectiveStrength > 0.8 && raise) {
    const potSized = Math.floor(snap.potTotal * (0.75 + rng() * 0.5));
    const target = clamp(potSized + snap.currentBet, raise.minAmount ?? snap.currentBet + snap.bigBlind, raise.maxAmount ?? potSized + snap.currentBet);
    return { type: "raise", amount: target };
  }
  if (effectiveStrength > potOdds + 0.1) {
    return { type: "call", amount: toCall };
  }
  if (effectiveStrength > potOdds && rng() < 0.5) {
    return { type: "call", amount: toCall };
  }
  return fold ? { type: "fold" } : { type: "call", amount: toCall };
}

/**
 * Chen-formula inspired 0..1 preflop strength (simplified).
 */
function preflopScore(hole: Card[]): number {
  if (hole.length < 2) return 0;
  const [a, b] = [...hole].sort((x, y) => RANK_VALUE[y.rank] - RANK_VALUE[x.rank]);
  const hi = RANK_VALUE[a.rank];
  const lo = RANK_VALUE[b.rank];
  const suited = a.suit === b.suit;
  const pair = hi === lo;

  let score: number;
  if (pair) {
    // pairs scale: 22=0.35 … AA=1.0
    score = 0.35 + ((hi - 2) / 12) * 0.65;
  } else {
    // top card heavy
    score = (hi / 14) * 0.55 + (lo / 14) * 0.2;
    const gap = hi - lo - 1; // 0 = connected
    if (gap === 0) score += 0.04;
    else if (gap === 1) score += 0.02;
    else if (gap >= 4) score -= 0.08;
    if (suited) score += 0.07;
  }
  return clamp(score, 0, 1);
}

function hasFlushDraw(hole: Card[], board: Card[]): boolean {
  const all = [...hole, ...board];
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  // need 4 of a suit with board dealt (flop+) and at least one hole card contributing
  for (const [suit, count] of counts) {
    if (count === 4) {
      const holeCountInSuit = hole.filter((h) => h.suit === suit).length;
      if (holeCountInSuit >= 1 && board.length >= 3 && board.length <= 4) return true;
    }
  }
  return false;
}

function hasOpenEnderOrGutshot(hole: Card[], board: Card[]): boolean {
  if (board.length < 3 || board.length > 4) return false;
  const values = new Set<number>();
  for (const c of [...hole, ...board]) values.add(RANK_VALUE[c.rank]);
  if (values.has(14)) values.add(1);
  const sorted = [...values].sort((a, b) => a - b);
  // any window of 5 containing 4 consecutive values -> draw
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const hits = window.filter((v) => sorted.includes(v)).length;
    if (hits === 4) return true;
  }
  return false;
}

function has(legal: LegalAction[], type: BotDecision["type"]): boolean {
  return legal.some((l) => l.type === type);
}

function find(legal: LegalAction[], type: BotDecision["type"]): LegalAction | undefined {
  return legal.find((l) => l.type === type);
}

function raiseSize(snap: GameSnapshot, raise: LegalAction, multiple: number): number {
  const target = Math.max(raise.minAmount ?? 0, Math.floor(snap.bigBlind * multiple));
  return Math.min(target, raise.maxAmount ?? target);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// re-export so unused-import linters don't complain; used by potential future KO tiebreakers
export { compareRanks };
