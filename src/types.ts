export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Suit = "c" | "d" | "h" | "s";

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allIn";

export type ActionIntent = {
  type: ActionType;
  playerId: string;
  amount?: number;
};

export type TablePhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "handComplete";
export type SeatStatus = "empty" | "sittingOut" | "active" | "folded" | "allIn" | "busted";

export type LegalAction = {
  type: ActionType;
  minAmount?: number;
  maxAmount?: number;
};

export type SeatSnapshot = {
  seatIndex: number;
  playerId: string | null;
  displayName: string | null;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  status: SeatStatus;
  cards?: Card[];
};

export type GameSnapshot = {
  tableId: string;
  clubId?: string;
  phase: TablePhase;
  dealerSeat: number | null;
  activeSeat: number | null;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  /**
   * Authoritative pot total for display.
   * - During preflop/flop/turn/river: sum of all seat `committedTotal` (chips already in front of players for this hand).
   * - During showdown and handComplete: the resolved pot amount at the moment of showdown (not affected by payouts distributed into winner stacks).
   */
  potTotal: number;
  /** Highest committed amount this street. 0 postflop before any bet, equals bigBlind preflop before action. Always 0 at showdown/handComplete. */
  currentBet: number;
  communityCards: Card[];
  seats: SeatSnapshot[];
  /**
   * Legal actions keyed by playerId. Only the active player will have non-empty actions.
   * All other seated players (including active-but-not-on-turn, folded, allIn, sittingOut) map to [].
   */
  legalActionsByPlayerId: Record<string, LegalAction[]>;
  lastEvent?: string;
  handHistory: string[];
  winningSeatIndexes: number[];
  payoutSummary: PayoutSummary[];
  sidePots: PotSnapshot[];
  /** Seats that reached showdown. Revealed during showdown, preserved through handComplete, empty for uncontested hands. */
  showdownSeatIndexes: number[];
  showdownSummary?: ShowdownSummary;
};

export type PayoutSummary = {
  seatIndex: number;
  playerId: string;
  amount: number;
};

export type PotSnapshot = {
  amount: number;
  eligibleSeatIndexes: number[];
  winnerSeatIndexes: number[];
};

export type ShowdownSummary = {
  winningSeatIndexes: number[];
  payoutSummary: PayoutSummary[];
  sidePots: PotSnapshot[];
  oddChipRule: string;
  resultText: string;
};

export type PlayerPrivateSnapshot = {
  tableId: string;
  playerId: string;
  phase: TablePhase;
  cards: Card[];
};

export type Seat = {
  seatIndex: number;
  playerId: string | null;
  displayName: string | null;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  status: SeatStatus;
  cards: Card[];
  actedThisStreet: boolean;
};

export type TableConfig = {
  tableId: string;
  clubId?: string;
  maxPlayers?: number;
  smallBlind: number;
  bigBlind: number;
  rng?: () => number;
};

export type PlayerSeatInput = {
  playerId: string;
  displayName: string;
  stack: number;
  seatIndex?: number;
  sittingOut?: boolean;
};

export type TableState = {
  tableId: string;
  clubId?: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  rng: () => number;
  phase: TablePhase;
  dealerSeat: number | null;
  activeSeat: number | null;
  currentBet: number;
  /**
   * The size of the last full raise this street (or big blind when no action yet this street).
   * Used to compute legal raise targets as `currentBet + minRaise`.
   */
  minRaise: number;
  deck: Card[];
  communityCards: Card[];
  seats: Seat[];
  handHistory: string[];
  lastEvent?: string;
  handNumber: number;
  winningSeatIndexes: number[];
  payoutSummary: PayoutSummary[];
  sidePots: PotSnapshot[];
  showdownSummary?: ShowdownSummary;
  showdownRevealed: boolean;
  /** Seats that reached showdown with cards to reveal (set by runShowdown, cleared by completeHand/startHand). */
  showdownSeatIndexes: number[];
  /** Resolved pot amount at the moment of showdown / uncontested completion. Used by snapshots during showdown and handComplete. */
  resolvedPotTotal: number;
};

export type SerializedTableState = Omit<TableState, "rng"> & {
  version: 1;
};
