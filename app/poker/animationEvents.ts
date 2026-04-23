let _seq = 0;
export const nextAnimId = (): number => ++_seq;

/** A chip token flew from a seat toward the pot. */
export type CommitChipsEvent = {
  id: number;
  type: "commitChips";
  seatIndex: number;
  amount: number;
};

/** Seat transitioned active/allIn → folded; show cards flying off. */
export type FoldCardsEvent = {
  id: number;
  type: "foldCards";
  seatIndex: number;
};

/** One or more community cards were revealed. */
export type RevealStreetEvent = {
  id: number;
  type: "revealStreet";
  /** How many new cards appeared (1 or 3). */
  count: number;
  /** Index of first new card in the full communityCards array. */
  startIndex: number;
};

/** A hand started; animate a card flying to this seat. */
export type DealCardEvent = {
  id: number;
  type: "dealCard";
  seatIndex: number;
  /** Clockwise position from dealer+1 — used to stagger animation delay. */
  dealOrder: number;
};

/** Pot was awarded; animate chips flying from center to winner. */
export type AwardPotEvent = {
  id: number;
  type: "awardPot";
  toSeatIndex: number;
  amount: number;
};

export type AnimEvent =
  | CommitChipsEvent
  | FoldCardsEvent
  | RevealStreetEvent
  | DealCardEvent
  | AwardPotEvent;
