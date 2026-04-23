import type { Card, Rank } from "./types.js";
import { invariant } from "./errors.js";

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

export type HandRank = {
  category: number;
  kickers: number[];
};

export type EvaluatedHand = {
  rank: HandRank;
  cards: Card[];
};

export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) {
    return a.category > b.category ? 1 : -1;
  }
  const size = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < size; i += 1) {
    const av = a.kickers[i] ?? 0;
    const bv = b.kickers[i] ?? 0;
    if (av !== bv) {
      return av > bv ? 1 : -1;
    }
  }
  return 0;
}

export function evaluateSeven(cards: Card[]): EvaluatedHand {
  invariant(cards.length >= 5 && cards.length <= 7, "BAD_EVAL_INPUT", "evaluateSeven expects 5-7 cards");
  let best: EvaluatedHand | null = null;
  for (const combo of combinations(cards, 5)) {
    const rank = evaluateFive(combo);
    if (!best || compareRanks(rank, best.rank) > 0) {
      best = { rank, cards: combo };
    }
  }
  invariant(best, "EVAL_FAILED", "failed to evaluate hand");
  return best;
}

function evaluateFive(cards: Card[]): HandRank {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const entries = [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);

  if (isFlush && straightHigh) return { category: 8, kickers: [straightHigh] };
  if (entries[0][1] === 4) return { category: 7, kickers: [entries[0][0], entries[1][0]] };
  if (entries[0][1] === 3 && entries[1][1] === 2) return { category: 6, kickers: [entries[0][0], entries[1][0]] };
  if (isFlush) return { category: 5, kickers: values };
  if (straightHigh) return { category: 4, kickers: [straightHigh] };
  if (entries[0][1] === 3) {
    const kickers = entries.slice(1).map((e) => e[0]).sort((a, b) => b - a);
    return { category: 3, kickers: [entries[0][0], ...kickers] };
  }
  if (entries[0][1] === 2 && entries[1][1] === 2) {
    const pairRanks = [entries[0][0], entries[1][0]].sort((a, b) => b - a);
    return { category: 2, kickers: [...pairRanks, entries[2][0]] };
  }
  if (entries[0][1] === 2) {
    const kickers = entries.slice(1).map((e) => e[0]).sort((a, b) => b - a);
    return { category: 1, kickers: [entries[0][0], ...kickers] };
  }
  return { category: 0, kickers: values };
}

function getStraightHigh(valuesDesc: number[]): number | null {
  const set = new Set(valuesDesc);
  if (set.has(14)) set.add(1);
  const uniques = [...set].sort((a, b) => a - b);
  let run = 1;
  let best: number | null = null;
  for (let i = 1; i < uniques.length; i += 1) {
    if (uniques[i] === uniques[i - 1] + 1) {
      run += 1;
      if (run >= 5) best = uniques[i];
    } else {
      run = 1;
    }
  }
  return best;
}

function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, current: T[]): void => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      pick(i + 1, current);
      current.pop();
    }
  };
  pick(0, []);
  return out;
}
