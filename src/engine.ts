import { cardKey, createDeck, shuffle } from "./cards.js";
import { invariant, PokerEngineError } from "./errors.js";
import { compareRanks, evaluateSeven } from "./evaluator.js";
import type {
  ActionIntent,
  Card,
  GameSnapshot,
  LegalAction,
  PlayerPrivateSnapshot,
  PlayerSeatInput,
  PotSnapshot,
  PayoutSummary,
  Seat,
  SeatSnapshot,
  SeatStatus,
  SerializedTableState,
  TableConfig,
  TableState
} from "./types.js";

const MAX_PLAYERS_DEFAULT = 6;
const MIN_PLAYERS = 2;
export const ODD_CHIP_RULE =
  "Odd chips are awarded one seat at a time clockwise from the dealer button among tied winners.";

/* ------------------------------------------------------------------ */
/* Table lifecycle                                                     */
/* ------------------------------------------------------------------ */

export function createTable(config: TableConfig): TableState {
  invariant(config.bigBlind > 0 && config.smallBlind > 0, "BAD_BLINDS", "blinds must be positive");
  invariant(config.smallBlind <= config.bigBlind, "BAD_BLINDS", "small blind cannot exceed big blind");
  const maxPlayers = config.maxPlayers ?? MAX_PLAYERS_DEFAULT;
  invariant(maxPlayers >= 2 && maxPlayers <= 6, "BAD_TABLE_SIZE", "maxPlayers must be between 2 and 6");
  const rng = config.rng ?? Math.random;
  const seats: Seat[] = Array.from({ length: maxPlayers }, (_, seatIndex) => ({
    seatIndex,
    playerId: null,
    displayName: null,
    stack: 0,
    committedThisStreet: 0,
    committedTotal: 0,
    status: "empty",
    cards: [],
    actedThisStreet: false
  }));
  return {
    tableId: config.tableId,
    clubId: config.clubId,
    maxPlayers,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    rng,
    phase: "waiting",
    dealerSeat: null,
    activeSeat: null,
    currentBet: 0,
    minRaise: config.bigBlind,
    deck: [],
    communityCards: [],
    seats,
    handHistory: [],
    handNumber: 0,
    winningSeatIndexes: [],
    payoutSummary: [],
    sidePots: [],
    showdownSummary: undefined,
    showdownRevealed: false,
    showdownSeatIndexes: [],
    resolvedPotTotal: 0
  };
}

export function seatPlayer(table: TableState, player: PlayerSeatInput): TableState {
  ensureBetweenHands(table);
  invariant(typeof player.playerId === "string" && player.playerId.length > 0, "BAD_PLAYER_ID", "playerId required");
  invariant(player.stack >= 0, "BAD_STACK", "stack must be non-negative");
  invariant(!table.seats.some((s) => s.playerId === player.playerId), "DUPLICATE_PLAYER", "player already seated");
  const seat = resolveSeat(table, player.seatIndex);
  invariant(seat.status === "empty", "SEAT_OCCUPIED", "seat is not empty");
  seat.playerId = player.playerId;
  seat.displayName = player.displayName;
  seat.stack = player.stack;
  seat.status = player.stack === 0 ? "busted" : player.sittingOut ? "sittingOut" : "active";
  log(table, `player seated: ${player.displayName} (${player.playerId}) seat ${seat.seatIndex}`);
  return table;
}

export function removePlayer(table: TableState, playerId: string): TableState {
  ensureBetweenHands(table);
  const seat = getSeatByPlayerId(table, playerId);
  invariant(seat, "PLAYER_NOT_FOUND", "player is not seated");
  clearSeat(seat);
  log(table, `player removed: ${playerId}`);
  return table;
}

export function startHand(table: TableState): TableState {
  ensureBetweenHands(table);
  const ready = occupiedSeats(table).filter((s) => s.status !== "sittingOut" && s.stack > 0);
  invariant(ready.length >= MIN_PLAYERS, "NOT_ENOUGH_PLAYERS", "at least 2 active players are required");

  resetHandState(table);
  table.handNumber += 1;
  table.phase = "preflop";
  table.deck = shuffle(createDeck(), table.rng);
  table.dealerSeat = nextDealerSeat(table, table.dealerSeat);
  const dealer = mustSeat(table, table.dealerSeat);
  const blindInfo = getBlindSeats(table, dealer.seatIndex);
  const sb = mustSeat(table, blindInfo.smallBlindSeat);
  const bb = mustSeat(table, blindInfo.bigBlindSeat);

  postBlind(table, sb, table.smallBlind);
  postBlind(table, bb, table.bigBlind);
  table.currentBet = bb.committedThisStreet;
  table.minRaise = table.bigBlind;

  for (let r = 0; r < 2; r += 1) {
    for (const seat of clockwiseSeats(table, sb.seatIndex)) {
      if (!isEligibleForCards(seat)) continue;
      const card = table.deck.shift();
      invariant(card, "DECK_EMPTY", "deck exhausted while dealing");
      seat.cards.push(card);
    }
  }

  table.activeSeat = firstToActPreflop(table, blindInfo.bigBlindSeat);
  setAllActedFalse(table);
  log(table, `hand ${table.handNumber} started`);
  maybeAutoAdvance(table);
  return table;
}

/* ------------------------------------------------------------------ */
/* Action application                                                  */
/* ------------------------------------------------------------------ */

export function getLegalActions(table: TableState, playerId: string): LegalAction[] {
  if (!isInActiveHand(table)) return [];
  const seat = getSeatByPlayerId(table, playerId);
  if (!seat || seat.seatIndex !== table.activeSeat) return [];
  if (seat.status !== "active") return [];
  return computeLegalActions(table, seat);
}

export function applyAction(table: TableState, action: ActionIntent): TableState {
  invariant(isInActiveHand(table), "HAND_NOT_ACTIVE", "cannot apply action unless hand is active");
  const seat = getSeatByPlayerId(table, action.playerId);
  invariant(seat, "PLAYER_NOT_FOUND", "player not seated");
  invariant(seat.seatIndex === table.activeSeat, "NOT_YOUR_TURN", "action attempted out of turn");
  invariant(seat.status === "active", "PLAYER_NOT_ACTIVE", "only active players can act");

  const legal = computeLegalActions(table, seat);
  const actionRule = legal.find((l) => l.type === action.type);
  invariant(actionRule, "ILLEGAL_ACTION", `${action.type} is not legal right now`);

  if ((action.type === "bet" || action.type === "raise") && typeof action.amount !== "number") {
    throw new PokerEngineError("MISSING_AMOUNT", `${action.type} requires amount`);
  }
  if (actionRule.minAmount !== undefined && action.amount !== undefined && action.amount < actionRule.minAmount) {
    throw new PokerEngineError("AMOUNT_TOO_SMALL", `minimum ${action.type} is ${actionRule.minAmount}`);
  }
  if (actionRule.maxAmount !== undefined && action.amount !== undefined && action.amount > actionRule.maxAmount) {
    throw new PokerEngineError("AMOUNT_TOO_LARGE", `maximum ${action.type} is ${actionRule.maxAmount}`);
  }

  const toCall = Math.max(0, table.currentBet - seat.committedThisStreet);

  switch (action.type) {
    case "fold":
      seat.status = "folded";
      seat.actedThisStreet = true;
      log(table, `${seat.playerId} folds`);
      break;
    case "check":
      invariant(toCall === 0, "CANNOT_CHECK", "cannot check facing a bet");
      seat.actedThisStreet = true;
      log(table, `${seat.playerId} checks`);
      break;
    case "call": {
      const pay = Math.min(seat.stack, toCall);
      commitChips(seat, pay);
      seat.actedThisStreet = true;
      if (seat.stack === 0) seat.status = "allIn";
      log(table, `${seat.playerId} calls ${pay}`);
      break;
    }
    case "bet": {
      const target = action.amount!;
      invariant(table.currentBet === 0, "ILLEGAL_ACTION", "bet is only legal when currentBet is 0; use raise otherwise");
      const pay = target - seat.committedThisStreet;
      commitChips(seat, pay);
      applyAggression(table, seat, target, target, true);
      log(table, `${seat.playerId} bets ${target}`);
      break;
    }
    case "raise": {
      const target = action.amount!;
      invariant(table.currentBet > 0, "ILLEGAL_ACTION", "raise is only legal when facing a bet");
      const pay = target - seat.committedThisStreet;
      const raiseSize = target - table.currentBet;
      commitChips(seat, pay);
      applyAggression(table, seat, target, raiseSize, false);
      log(table, `${seat.playerId} raises to ${target}`);
      break;
    }
    case "allIn": {
      const target = seat.committedThisStreet + seat.stack;
      const pay = seat.stack;
      commitChips(seat, pay);
      seat.status = "allIn";
      if (target > table.currentBet) {
        const raiseSize = target - table.currentBet;
        const isBetFromZero = table.currentBet === 0;
        applyAggression(table, seat, target, raiseSize, isBetFromZero);
        log(table, `${seat.playerId} is all-in for ${target}`);
      } else {
        seat.actedThisStreet = true;
        log(table, `${seat.playerId} is all-in for ${target}`);
      }
      break;
    }
  }

  resolveProgress(table);
  return table;
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

export function getPublicSnapshot(table: TableState): GameSnapshot {
  return createSnapshot(table, null);
}

export function getPlayerSnapshot(table: TableState, playerId: string): GameSnapshot {
  return createSnapshot(table, playerId);
}

export function getPlayerPrivateSnapshot(table: TableState, playerId: string): PlayerPrivateSnapshot {
  const seat = getSeatByPlayerId(table, playerId);
  invariant(seat, "PLAYER_NOT_FOUND", "player not seated");
  const cards = isInActiveHand(table) ? [...seat.cards] : [];
  return {
    tableId: table.tableId,
    playerId,
    phase: table.phase,
    cards
  };
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

export function serializeTable(table: TableState): string {
  const serialized: SerializedTableState = {
    version: 1,
    tableId: table.tableId,
    clubId: table.clubId,
    maxPlayers: table.maxPlayers,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    phase: table.phase,
    dealerSeat: table.dealerSeat,
    activeSeat: table.activeSeat,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    deck: table.deck,
    communityCards: table.communityCards,
    seats: table.seats,
    handHistory: table.handHistory,
    lastEvent: table.lastEvent,
    handNumber: table.handNumber,
    winningSeatIndexes: table.winningSeatIndexes,
    payoutSummary: table.payoutSummary,
    sidePots: table.sidePots,
    showdownSummary: table.showdownSummary,
    showdownRevealed: table.showdownRevealed,
    showdownSeatIndexes: table.showdownSeatIndexes,
    resolvedPotTotal: table.resolvedPotTotal
  };
  return JSON.stringify(serialized);
}

export function hydrateTable(serialized: string, options?: { rng?: () => number }): TableState {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch (err) {
    throw new PokerEngineError("BAD_SERIALIZED_DATA", `serialized data is not valid JSON: ${(err as Error).message}`);
  }
  invariant(raw !== null && typeof raw === "object", "BAD_SERIALIZED_DATA", "serialized data must be an object");
  const r = raw as Record<string, unknown>;
  invariant(r.version === 1, "BAD_SERIALIZED_DATA", "unsupported serialized table version");
  invariant(typeof r.tableId === "string", "BAD_SERIALIZED_DATA", "invalid serialized table: tableId");
  invariant(typeof r.smallBlind === "number" && r.smallBlind > 0, "BAD_SERIALIZED_DATA", "invalid smallBlind");
  invariant(typeof r.bigBlind === "number" && r.bigBlind > 0, "BAD_SERIALIZED_DATA", "invalid bigBlind");
  invariant(typeof r.maxPlayers === "number" && r.maxPlayers >= 2 && r.maxPlayers <= 6, "BAD_SERIALIZED_DATA", "invalid maxPlayers");
  invariant(Array.isArray(r.seats) && r.seats.length === r.maxPlayers, "BAD_SERIALIZED_DATA", "invalid seats array");
  invariant(Array.isArray(r.deck), "BAD_SERIALIZED_DATA", "invalid deck");
  invariant(Array.isArray(r.communityCards), "BAD_SERIALIZED_DATA", "invalid communityCards");
  invariant(typeof r.phase === "string", "BAD_SERIALIZED_DATA", "invalid phase");

  const table: TableState = {
    tableId: r.tableId as string,
    clubId: typeof r.clubId === "string" ? r.clubId : undefined,
    maxPlayers: r.maxPlayers as number,
    smallBlind: r.smallBlind as number,
    bigBlind: r.bigBlind as number,
    rng: options?.rng ?? Math.random,
    phase: r.phase as TableState["phase"],
    dealerSeat: typeof r.dealerSeat === "number" ? r.dealerSeat : null,
    activeSeat: typeof r.activeSeat === "number" ? r.activeSeat : null,
    currentBet: typeof r.currentBet === "number" ? r.currentBet : 0,
    minRaise: typeof r.minRaise === "number" ? r.minRaise : (r.bigBlind as number),
    deck: r.deck as Card[],
    communityCards: r.communityCards as Card[],
    seats: r.seats as Seat[],
    handHistory: Array.isArray(r.handHistory) ? (r.handHistory as string[]) : [],
    lastEvent: typeof r.lastEvent === "string" ? r.lastEvent : undefined,
    handNumber: typeof r.handNumber === "number" ? r.handNumber : 0,
    winningSeatIndexes: Array.isArray(r.winningSeatIndexes) ? (r.winningSeatIndexes as number[]) : [],
    payoutSummary: Array.isArray(r.payoutSummary) ? (r.payoutSummary as PayoutSummary[]) : [],
    sidePots: Array.isArray(r.sidePots) ? (r.sidePots as PotSnapshot[]) : [],
    showdownSummary: r.showdownSummary as TableState["showdownSummary"],
    showdownRevealed: Boolean(r.showdownRevealed),
    showdownSeatIndexes: Array.isArray(r.showdownSeatIndexes) ? (r.showdownSeatIndexes as number[]) : [],
    resolvedPotTotal: typeof r.resolvedPotTotal === "number" ? r.resolvedPotTotal : 0
  };
  return table;
}

/* ------------------------------------------------------------------ */
/* Internal: snapshot construction                                     */
/* ------------------------------------------------------------------ */

function createSnapshot(table: TableState, viewerPlayerId: string | null): GameSnapshot {
  const showdownSeatSet = new Set(table.showdownSeatIndexes);
  const seats: SeatSnapshot[] = table.seats.map((seat) => {
    const cards = seatCardsForSnapshot(table, seat, viewerPlayerId, showdownSeatSet);
    return {
      seatIndex: seat.seatIndex,
      playerId: seat.playerId,
      displayName: seat.displayName,
      stack: seat.stack,
      committedThisStreet: seat.committedThisStreet,
      committedTotal: seat.committedTotal,
      status: seat.status,
      cards
    };
  });

  const legalActionsByPlayerId: Record<string, LegalAction[]> = {};
  for (const seat of table.seats) {
    if (!seat.playerId) continue;
    legalActionsByPlayerId[seat.playerId] =
      seat.seatIndex === table.activeSeat ? computeLegalActions(table, seat) : [];
  }

  const showingResolved = table.phase === "showdown" || table.phase === "handComplete";
  const potTotal = showingResolved ? table.resolvedPotTotal : sumCommitted(table);
  const currentBet = showingResolved ? 0 : table.currentBet;

  return {
    tableId: table.tableId,
    clubId: table.clubId,
    phase: table.phase,
    dealerSeat: table.dealerSeat,
    activeSeat: table.activeSeat,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    minRaise: table.minRaise,
    potTotal,
    currentBet,
    communityCards: [...table.communityCards],
    seats,
    legalActionsByPlayerId,
    lastEvent: table.lastEvent,
    handHistory: [...table.handHistory],
    winningSeatIndexes: [...table.winningSeatIndexes],
    payoutSummary: [...table.payoutSummary],
    sidePots: table.sidePots.map((p) => ({ ...p, eligibleSeatIndexes: [...p.eligibleSeatIndexes], winnerSeatIndexes: [...p.winnerSeatIndexes] })),
    showdownSeatIndexes: [...table.showdownSeatIndexes],
    showdownSummary: table.showdownSummary
  };
}

function seatCardsForSnapshot(
  table: TableState,
  seat: Seat,
  viewerPlayerId: string | null,
  showdownSeatSet: Set<number>
): Card[] | undefined {
  if (seat.cards.length === 0) return undefined;
  // During an active hand, show the viewer's own cards.
  if (viewerPlayerId !== null && seat.playerId === viewerPlayerId && isInActiveHand(table)) {
    return [...seat.cards];
  }
  // At showdown, reveal cards for seats that reached showdown.
  if (table.phase === "showdown" && showdownSeatSet.has(seat.seatIndex)) {
    return [...seat.cards];
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Legal actions                                                       */
/* ------------------------------------------------------------------ */

function computeLegalActions(table: TableState, seat: Seat): LegalAction[] {
  if (seat.status !== "active") return [];
  const toCall = Math.max(0, table.currentBet - seat.committedThisStreet);
  const stack = seat.stack;
  const legal: LegalAction[] = [];
  const maxTarget = seat.committedThisStreet + stack;

  if (toCall > 0) {
    legal.push({ type: "fold" });
    const callAmount = Math.min(toCall, stack);
    legal.push({ type: "call", minAmount: callAmount, maxAmount: callAmount });
    const minRaiseTarget = minimumRaiseTarget(table);
    const canRaiseThisTurn = !seat.actedThisStreet;
    if (canRaiseThisTurn && stack > toCall && maxTarget >= minRaiseTarget) {
      legal.push({ type: "raise", minAmount: minRaiseTarget, maxAmount: maxTarget });
    }
    if (stack > 0) legal.push({ type: "allIn" });
    return legal;
  }

  legal.push({ type: "check" });
  const minBetTarget = table.bigBlind;
  if (stack > 0 && maxTarget >= minBetTarget) {
    legal.push({ type: "bet", minAmount: minBetTarget, maxAmount: maxTarget });
  }
  if (stack > 0) legal.push({ type: "allIn" });
  return legal;
}

/* ------------------------------------------------------------------ */
/* Hand progression                                                    */
/* ------------------------------------------------------------------ */

function resolveProgress(table: TableState): void {
  if (activeContenders(table).length <= 1) {
    finishWithoutShowdown(table);
    return;
  }
  if (isBettingRoundComplete(table)) {
    advanceStreet(table);
    maybeAutoAdvance(table);
    return;
  }
  table.activeSeat = nextActor(table, table.activeSeat);
  maybeAutoAdvance(table);
}

function isBettingRoundComplete(table: TableState): boolean {
  const contenders = activeContenders(table);
  if (contenders.length <= 1) return true;
  const actionable = contenders.filter((s) => s.status === "active");
  if (actionable.length === 0) return true;
  return actionable.every((s) => s.actedThisStreet && s.committedThisStreet === table.currentBet);
}

function nextActor(table: TableState, fromSeat: number | null): number | null {
  if (fromSeat === null) return null;
  const occupied = clockwiseSeats(table, fromSeat).slice(1);
  for (const seat of occupied) {
    if (seat.status === "active") return seat.seatIndex;
  }
  return null;
}

function maybeAutoAdvance(table: TableState): void {
  if (!isInActiveHand(table)) return;
  // If only one contender remains, finish immediately.
  if (activeContenders(table).length <= 1) {
    finishWithoutShowdown(table);
    return;
  }
  // Auto-advance streets when no active player can act (all remaining are all-in or only one active and matched).
  while (table.phase !== "showdown" && table.phase !== "handComplete") {
    const contenders = activeContenders(table);
    if (contenders.length <= 1) {
      finishWithoutShowdown(table);
      return;
    }
    const active = contenders.filter((s) => s.status === "active");
    if (active.length === 0) {
      // Everyone left is all-in. Run out the board.
      advanceStreet(table);
      continue;
    }
    if (active.length === 1 && active[0].committedThisStreet === table.currentBet) {
      // Lone active player vs. only all-in opponents — no meaningful action.
      advanceStreet(table);
      continue;
    }
    break;
  }
}

function advanceStreet(table: TableState): void {
  if (table.phase === "preflop") {
    burnCard(table);
    dealCommunity(table, 3);
    table.phase = "flop";
    startNewStreet(table);
    return;
  }
  if (table.phase === "flop") {
    burnCard(table);
    dealCommunity(table, 1);
    table.phase = "turn";
    startNewStreet(table);
    return;
  }
  if (table.phase === "turn") {
    burnCard(table);
    dealCommunity(table, 1);
    table.phase = "river";
    startNewStreet(table);
    return;
  }
  if (table.phase === "river") {
    runShowdown(table);
  }
}

function startNewStreet(table: TableState): void {
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  for (const seat of table.seats) {
    seat.committedThisStreet = 0;
    seat.actedThisStreet = false;
  }
  table.activeSeat = nextActor(table, table.dealerSeat);
  log(table, `street: ${table.phase}`);
}

/* ------------------------------------------------------------------ */
/* Showdown and settlement                                             */
/* ------------------------------------------------------------------ */

function runShowdown(table: TableState): void {
  // Deal any missing community cards (shouldn't happen if we advanced normally, but defensive).
  while (table.communityCards.length < 5) {
    if (table.communityCards.length === 0) burnCard(table);
    dealCommunity(table, 1);
  }

  const pots = buildSidePots(table);
  const resolvedPotTotal = pots.reduce((sum, p) => sum + p.amount, 0);
  const payouts = new Map<number, number>();
  const sidePots: PotSnapshot[] = [];
  const winningSeatSet = new Set<number>();

  for (const pot of pots) {
    const eligible = pot.eligibleSeats
      .map((seatIndex) => table.seats[seatIndex])
      .filter((s) => s.status !== "folded");
    if (eligible.length === 0) {
      // Degenerate: all contributors folded (can only happen via uncontested path; should not reach here).
      sidePots.push({ amount: pot.amount, eligibleSeatIndexes: [...pot.eligibleSeats], winnerSeatIndexes: [] });
      continue;
    }
    let bestRank: ReturnType<typeof evaluateSeven>["rank"] | null = null;
    let winners: Seat[] = [];
    for (const seat of eligible) {
      const evalResult = evaluateSeven([...seat.cards, ...table.communityCards]);
      if (!bestRank || compareRanks(evalResult.rank, bestRank) > 0) {
        bestRank = evalResult.rank;
        winners = [seat];
      } else if (compareRanks(evalResult.rank, bestRank) === 0) {
        winners.push(seat);
      }
    }
    const split = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;
    for (const winner of winners) {
      payouts.set(winner.seatIndex, (payouts.get(winner.seatIndex) ?? 0) + split);
      winningSeatSet.add(winner.seatIndex);
    }
    if (remainder > 0) {
      const ordered = orderFromSeat(table, (table.dealerSeat ?? 0), winners.map((w) => w.seatIndex));
      for (let i = 0; i < remainder; i += 1) {
        const seatIndex = ordered[i % ordered.length];
        payouts.set(seatIndex, (payouts.get(seatIndex) ?? 0) + 1);
        winningSeatSet.add(seatIndex);
      }
    }
    sidePots.push({
      amount: pot.amount,
      eligibleSeatIndexes: [...pot.eligibleSeats],
      winnerSeatIndexes: winners.map((w) => w.seatIndex)
    });
  }

  // Credit stacks with winnings. Do NOT clear committedTotal here — showdown snapshot
  // exposes resolvedPotTotal, and cleanup happens in completeHand.
  const payoutSummary: PayoutSummary[] = [];
  for (const [seatIndex, amount] of payouts.entries()) {
    const seat = table.seats[seatIndex];
    seat.stack += amount;
    if (seat.playerId) {
      payoutSummary.push({ seatIndex, playerId: seat.playerId, amount });
    }
    log(table, `${seat.playerId} wins ${amount}`);
  }
  payoutSummary.sort((a, b) => a.seatIndex - b.seatIndex);

  // Seats that reached showdown (had cards, did not fold).
  const showdownSeatIndexes = table.seats
    .filter((s) => s.cards.length > 0 && s.status !== "folded")
    .map((s) => s.seatIndex);

  table.payoutSummary = payoutSummary;
  table.sidePots = sidePots;
  table.winningSeatIndexes = [...winningSeatSet].sort((a, b) => a - b);
  table.resolvedPotTotal = resolvedPotTotal;
  table.showdownSeatIndexes = showdownSeatIndexes;
  table.showdownRevealed = true;
  table.showdownSummary = {
    winningSeatIndexes: [...table.winningSeatIndexes],
    payoutSummary: [...table.payoutSummary],
    sidePots: table.sidePots.map((p) => ({ ...p, eligibleSeatIndexes: [...p.eligibleSeatIndexes], winnerSeatIndexes: [...p.winnerSeatIndexes] })),
    oddChipRule: ODD_CHIP_RULE,
    resultText: table.payoutSummary
      .map((p) => `${table.seats[p.seatIndex].displayName ?? p.playerId} wins ${p.amount}`)
      .join("; ")
  };
  table.phase = "showdown";
  table.activeSeat = null;
  table.currentBet = 0;
  log(table, "showdown resolved");
}

export function completeHand(table: TableState): TableState {
  if (table.phase === "handComplete" || table.phase === "waiting") {
    return table;
  }
  invariant(table.phase === "showdown", "BAD_PHASE", "completeHand requires showdown phase");
  clearHandBoardAndSeats(table);
  table.phase = "handComplete";
  log(table, "hand complete");
  return table;
}

function finishWithoutShowdown(table: TableState): void {
  const remaining = activeContenders(table).filter((s) => s.status !== "folded");
  invariant(remaining.length === 1, "BAD_HAND_END", "expected exactly one remaining player");
  const winner = remaining[0];
  const amount = sumCommitted(table);
  winner.stack += amount;
  table.winningSeatIndexes = [winner.seatIndex];
  table.payoutSummary = winner.playerId
    ? [{ seatIndex: winner.seatIndex, playerId: winner.playerId, amount }]
    : [];
  table.sidePots = [
    { amount, eligibleSeatIndexes: [winner.seatIndex], winnerSeatIndexes: [winner.seatIndex] }
  ];
  table.resolvedPotTotal = amount;
  table.showdownSeatIndexes = [];
  table.showdownRevealed = false;
  table.showdownSummary = undefined;

  clearHandBoardAndSeats(table);
  table.phase = "handComplete";
  log(table, `${winner.playerId} wins ${amount} uncontested`);
}

/**
 * Clear per-hand board, cards, commitments, and normalize seat statuses.
 * Preserves payoutSummary / winningSeatIndexes / sidePots / showdownSummary / resolvedPotTotal
 * so the UI can still display a completed-hand result banner.
 */
function clearHandBoardAndSeats(table: TableState): void {
  for (const seat of table.seats) {
    seat.committedThisStreet = 0;
    seat.committedTotal = 0;
    seat.cards = [];
    seat.actedThisStreet = false;
    seat.status = normalizeSeatStatus(seat.status, seat.stack);
  }
  table.communityCards = [];
  table.deck = [];
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  table.activeSeat = null;
}

function normalizeSeatStatus(status: SeatStatus, stack: number): SeatStatus {
  if (status === "empty" || status === "sittingOut") return status;
  return stack > 0 ? "active" : "busted";
}

/* ------------------------------------------------------------------ */
/* Side pot math                                                        */
/* ------------------------------------------------------------------ */

function buildSidePots(table: TableState): { amount: number; eligibleSeats: number[] }[] {
  const levels = [...new Set(table.seats.map((s) => s.committedTotal).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligibleSeats: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const contrib = level - prev;
    const contributors = table.seats.filter((s) => s.committedTotal >= level);
    const amount = contrib * contributors.length;
    const eligibleSeats = contributors.filter((s) => s.status !== "folded").map((s) => s.seatIndex);
    pots.push({ amount, eligibleSeats });
    prev = level;
  }
  // Merge consecutive pots with identical eligible seats (avoids redundant layers).
  const merged: { amount: number; eligibleSeats: number[] }[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligibleSeats, pot.eligibleSeats)) {
      last.amount += pot.amount;
    } else {
      merged.push({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] });
    }
  }
  return merged;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const x of b) if (!set.has(x)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Aggression / betting rules                                          */
/* ------------------------------------------------------------------ */

/**
 * Update table betting state after a bet, raise, or aggressive all-in.
 *
 * Rules:
 * - `currentBet` always moves to the new `target`.
 * - A full aggression sets `minRaise` and reopens action for everyone else still to act.
 * - A completion of an incomplete opening all-in counts as the first full bet.
 * - A short all-in does NOT reopen action and does NOT update `minRaise`.
 */
function applyAggression(
  table: TableState,
  seat: Seat,
  target: number,
  raiseSize: number,
  isOpeningBet: boolean
): void {
  const previousMinRaise = table.minRaise;
  const completesIncompleteOpeningBet = !isOpeningBet && table.currentBet < table.bigBlind && target >= table.bigBlind;
  const isFullRaise = isOpeningBet ? target >= table.bigBlind : completesIncompleteOpeningBet || raiseSize >= previousMinRaise;
  table.currentBet = target;
  if (isFullRaise) {
    table.minRaise = isOpeningBet || completesIncompleteOpeningBet ? target : raiseSize;
    for (const other of table.seats) {
      if (other.seatIndex !== seat.seatIndex && other.status === "active") {
        other.actedThisStreet = false;
      }
    }
  }
  seat.actedThisStreet = true;
  if (seat.stack === 0) seat.status = "allIn";
}

function minimumRaiseTarget(table: TableState): number {
  if (table.currentBet < table.bigBlind) return table.bigBlind;
  return table.currentBet + table.minRaise;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function commitChips(seat: Seat, amount: number): void {
  invariant(amount >= 0, "BAD_AMOUNT", "amount must be non-negative");
  invariant(amount <= seat.stack, "INSUFFICIENT_STACK", "cannot commit more chips than stack");
  seat.stack -= amount;
  seat.committedThisStreet += amount;
  seat.committedTotal += amount;
}

function postBlind(table: TableState, seat: Seat, amount: number): void {
  const pay = Math.min(amount, seat.stack);
  commitChips(seat, pay);
  if (seat.stack === 0) seat.status = "allIn";
  log(table, `${seat.playerId} posts blind ${pay}`);
}

function firstToActPreflop(table: TableState, bigBlindSeat: number): number | null {
  const contenders = activeContenders(table);
  if (contenders.length === 2) {
    const dealer = invariantSeat(table, table.dealerSeat);
    return dealer.status === "active" ? dealer.seatIndex : nextActor(table, dealer.seatIndex);
  }
  return nextActor(table, bigBlindSeat);
}

function getBlindSeats(table: TableState, dealerSeat: number): { smallBlindSeat: number; bigBlindSeat: number } {
  const contenders = activeContenders(table);
  invariant(contenders.length >= 2, "NOT_ENOUGH_PLAYERS", "at least two players required");
  if (contenders.length === 2) {
    const other = nextEligibleSeat(table, dealerSeat);
    invariant(other !== null, "NO_BIG_BLIND", "failed to find heads-up big blind");
    return { smallBlindSeat: dealerSeat, bigBlindSeat: other };
  }
  const sb = nextEligibleSeat(table, dealerSeat);
  invariant(sb !== null, "NO_SMALL_BLIND", "failed to find small blind");
  const bb = nextEligibleSeat(table, sb);
  invariant(bb !== null, "NO_BIG_BLIND", "failed to find big blind");
  return { smallBlindSeat: sb, bigBlindSeat: bb };
}

function nextDealerSeat(table: TableState, previousDealer: number | null): number {
  const eligible = occupiedSeats(table).filter((s) => s.status !== "sittingOut" && s.stack > 0);
  invariant(eligible.length >= 2, "NOT_ENOUGH_PLAYERS", "at least two active players required");
  if (previousDealer === null) return eligible[0].seatIndex;
  const next = nextEligibleSeat(table, previousDealer);
  invariant(next !== null, "NO_DEALER", "failed to find next dealer");
  return next;
}

function nextEligibleSeat(table: TableState, fromSeat: number): number | null {
  const ring = clockwiseSeats(table, fromSeat).slice(1);
  for (const seat of ring) {
    if (seat.status !== "empty" && seat.status !== "sittingOut" && seat.stack > 0) {
      return seat.seatIndex;
    }
  }
  return null;
}

function clockwiseSeats(table: TableState, startSeat: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < table.maxPlayers; i += 1) {
    out.push(table.seats[(startSeat + i) % table.maxPlayers]);
  }
  return out;
}

function orderFromSeat(table: TableState, startSeat: number, seatIndexes: number[]): number[] {
  const set = new Set(seatIndexes);
  return clockwiseSeats(table, startSeat).map((s) => s.seatIndex).filter((s) => set.has(s));
}

function occupiedSeats(table: TableState): Seat[] {
  return table.seats.filter((s) => s.status !== "empty");
}

function activeContenders(table: TableState): Seat[] {
  return table.seats.filter((s) => s.status === "active" || s.status === "allIn");
}

function isEligibleForCards(seat: Seat): boolean {
  return seat.status === "active" || seat.status === "allIn";
}

function sumCommitted(table: TableState): number {
  return table.seats.reduce((sum, s) => sum + s.committedTotal, 0);
}

function burnCard(table: TableState): void {
  const burned = table.deck.shift();
  invariant(burned, "DECK_EMPTY", "deck exhausted while burning");
}

function dealCommunity(table: TableState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const card = table.deck.shift();
    invariant(card, "DECK_EMPTY", "deck exhausted while dealing board");
    table.communityCards.push(card);
  }
}

function resetHandState(table: TableState): void {
  table.winningSeatIndexes = [];
  table.payoutSummary = [];
  table.sidePots = [];
  table.showdownSummary = undefined;
  table.showdownRevealed = false;
  table.showdownSeatIndexes = [];
  table.resolvedPotTotal = 0;
  for (const seat of table.seats) {
    seat.committedThisStreet = 0;
    seat.committedTotal = 0;
    seat.cards = [];
    seat.actedThisStreet = false;
    seat.status = normalizeSeatStatus(seat.status, seat.stack);
  }
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  table.communityCards = [];
  table.deck = [];
  table.activeSeat = null;
  table.lastEvent = undefined;
}

function setAllActedFalse(table: TableState): void {
  for (const seat of table.seats) {
    seat.actedThisStreet = false;
  }
}

function clearSeat(seat: Seat): void {
  seat.playerId = null;
  seat.displayName = null;
  seat.stack = 0;
  seat.committedThisStreet = 0;
  seat.committedTotal = 0;
  seat.status = "empty";
  seat.cards = [];
  seat.actedThisStreet = false;
}

function resolveSeat(table: TableState, seatIndex: number | undefined): Seat {
  if (seatIndex !== undefined) {
    invariant(seatIndex >= 0 && seatIndex < table.maxPlayers, "BAD_SEAT_INDEX", "seat index out of range");
    return table.seats[seatIndex];
  }
  const open = table.seats.find((s) => s.status === "empty");
  invariant(open, "NO_OPEN_SEAT", "no open seats");
  return open;
}

function getSeatByPlayerId(table: TableState, playerId: string): Seat | undefined {
  return table.seats.find((s) => s.playerId === playerId);
}

function invariantSeat(table: TableState, seatIndex: number | null): Seat {
  invariant(seatIndex !== null, "MISSING_SEAT", "seat not found");
  return table.seats[seatIndex];
}

function mustSeat(table: TableState, seatIndex: number | null): Seat {
  invariant(seatIndex !== null, "NO_SEAT", "seat required");
  return table.seats[seatIndex];
}

function ensureBetweenHands(table: TableState): void {
  invariant(
    table.phase === "waiting" || table.phase === "handComplete",
    "HAND_IN_PROGRESS",
    "cannot change seats mid-hand"
  );
  if (table.phase === "handComplete") {
    table.phase = "waiting";
  }
}

function isInActiveHand(table: TableState): boolean {
  return table.phase !== "waiting" && table.phase !== "handComplete";
}

function log(table: TableState, message: string): void {
  table.lastEvent = message;
  table.handHistory.push(message);
}

export function deckHas52UniqueCards(deck: Card[]): boolean {
  if (deck.length !== 52) return false;
  return new Set(deck.map(cardKey)).size === 52;
}
