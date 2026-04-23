# Engine Contract

This document is the source of truth for how the poker engine is consumed by a
frontend and by an authoritative realtime table server. It is the only contract
a UI or server developer needs to integrate against — implementation details in
`src/engine.ts` may change, but this contract will not regress without a
version bump and migration notes.

## 1. Authoritative Model

- The engine is **server-authoritative and deterministic**.
- Clients never mutate table state directly.
- Clients submit only `ActionIntent`.
- The server validates the intent, applies it via `applyAction`, and emits the
  resulting `GameSnapshot` (or a per-player view) to connected clients.
- All randomness flows through an injected `rng: () => number`. Given the same
  seeded `rng` and the same sequence of intents, the table evolves
  identically. This is required for replay, testing, and audit.

The engine is a **pure TypeScript package**. It has zero runtime dependencies.
It does not talk to databases, sockets, file systems, or browsers. Hosting
those concerns is the caller's job.

## 2. Input

Clients send `ActionIntent`:

```ts
type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allIn";

type ActionIntent = {
  type: ActionType;
  playerId: string;
  amount?: number; // required for bet/raise; ignored for fold/check/call/allIn
};
```

Legal actions for a specific player are available via
`getLegalActions(table, playerId)` and are also embedded in every snapshot under
`legalActionsByPlayerId`.

## 3. Output

The engine exposes three snapshot shapes:

- `getPublicSnapshot(table) → GameSnapshot`
  Safe to broadcast to all clients. Hides private hole cards except at
  showdown, where only `showdownSeatIndexes` are revealed.

- `getPlayerSnapshot(table, playerId) → GameSnapshot`
  Same as the public snapshot, but the requesting player's own hole cards are
  attached to their seat during an active hand.

- `getPlayerPrivateSnapshot(table, playerId) → PlayerPrivateSnapshot`
  Minimal shape containing only the player's hole cards, for private channels.

## 4. Phase Lifecycle

```
waiting ── startHand ──▶ preflop ──▶ flop ──▶ turn ──▶ river
                                                         │
                                                         ▼
                        handComplete ◀── completeHand ── showdown
                                  │
                                  └── startHand ──▶ preflop (next hand)
```

- `waiting` — no active hand. `startHand` is the only meaningful transition.
- `preflop`, `flop`, `turn`, `river` — betting streets.
- `showdown` — terminal state of a contested hand. Pots are resolved, winners
  are computed, and cards of showdown-eligible seats are exposed. **The UI
  must be able to render showdown before the hand is cleared.**
- `handComplete` — post-hand cleanup is applied. Private cards and per-street
  commitments are cleared; summary fields are retained for UI display.

### Uncontested hands

If action folds to a single player, the engine skips `showdown` and transitions
directly to `handComplete`. The surviving player is awarded the pot, their
private cards are cleared, and no showdown reveal occurs. `payoutSummary`,
`winningSeatIndexes`, and `sidePots` remain available for UI display.

## 5. Showdown vs. handComplete

The distinction matters. Do not conflate them.

| Field                | showdown               | handComplete          |
|----------------------|------------------------|-----------------------|
| `communityCards`     | full board             | empty                 |
| seat.cards (eligible)| revealed               | cleared               |
| seat.cards (folded)  | hidden                 | cleared               |
| `currentBet`         | 0                      | 0                     |
| `potTotal`           | resolved pot amount    | resolved pot amount   |
| `committedThisStreet`| 0                      | 0                     |
| `committedTotal`     | chips contributed to pot (historical) | 0                     |
| `sidePots`           | populated              | populated             |
| `payoutSummary`      | populated              | populated             |
| `winningSeatIndexes` | populated              | populated             |
| `showdownSeatIndexes`| populated              | populated for contested hands, empty for uncontested hands |
| `showdownSummary`    | populated              | populated             |

Key rules:

- Showdown **preserves** board cards and the hole cards of every non-folded
  player who reached showdown, **including all-in losers whose stack is now
  zero**. Busted status does not hide showdown cards.
- `completeHand(table)` is the only API that clears cards, board, per-street
  commitments, and historical seat commitments. Callers drive this transition explicitly, giving the
  UI a well-defined window to render the showdown reveal.

## 6. Pot and Payout Fields

All monetary fields are integer chip counts. There is no fractional chip
arithmetic.

- `potTotal` — authoritative pot for display.
  - During `preflop/flop/turn/river`: equals the sum of `seat.committedTotal`
    across all seats (chips already wagered this hand).
  - During `showdown` and `handComplete`: equals the resolved pot at the moment
    the hand was decided. It does **not** drop to zero when winnings are
    credited to stacks.
- `currentBet` — the highest `committedThisStreet` on the current street.
  Always 0 at showdown/handComplete. Equals `bigBlind` preflop before action.
- `minRaise` — size of the last full raise this street (or `bigBlind` on a
  street with no action yet). Legal raise target is `currentBet + minRaise`.
- `sidePots[]` — ordered main/side pots with `eligibleSeatIndexes` and
  `winnerSeatIndexes`. Their `amount`s sum to `potTotal`.
- `payoutSummary[]` — per-winner chip awards for the hand. Sums to `potTotal`.
- `winningSeatIndexes[]` — deduped seats that won any pot.
- `showdownSeatIndexes[]` — seats whose hole cards are exposed in showdown.
  Empty outside `showdown` and for uncontested hands.
- `showdownSummary` — denormalized human-readable summary plus the odd-chip
  rule string, for UI rendering and replay.

### Odd chips

When a pot cannot be divided evenly among tied winners, odd chips are awarded
one at a time starting with the first eligible seat **clockwise from the
dealer button**. This rule is documented in `showdownSummary.oddChipRule`.

### Chip conservation

Across a full hand (`startHand` → `completeHand`), the sum of
`seat.stack + seat.committedTotal` before the hand equals the sum of
`seat.stack` after `completeHand`. The test suite asserts this invariant.

## 7. All-in and Min-Raise Semantics

The engine implements standard no-limit hold'em rules.

- `currentBet` is the highest committed amount this street.
- `minRaise` is the size of the last full raise this street. It is seeded to
  `bigBlind` at the start of each street (and preflop is seeded by the big
  blind itself).
- The first opening bet on a postflop street must be at least `bigBlind` and
  establishes a new `minRaise` equal to that bet.
- A legal **raise target** is `currentBet + minRaise`.
- A **full raise** reopens action (all other active seats have
  `actedThisStreet` reset to false) and updates `minRaise` to the raise size.
- A **short all-in** (going all-in for less than a full raise target) does
  **not** reopen action to players who already had a chance to act against the
  previous full raise, and does **not** update `minRaise`. Players still to
  act may respond normally.
- `raise` is only legal when the player can meet `currentBet + minRaise`.
- `allIn` is always legal when the player has a stack and action is on them.
  This is the only legal way to put in a short all-in raise.

## 8. Snapshot Visibility Rules

- **Public snapshot** (`getPublicSnapshot`) — hides `cards` for every seat
  except those listed in `showdownSeatIndexes` during `showdown`.
- **Player snapshot** (`getPlayerSnapshot`) — same as public, plus the
  requesting player's own hole cards during an active hand.
- **Private snapshot** (`getPlayerPrivateSnapshot`) — only the requesting
  player's cards, plus identifying metadata.
- **handComplete** snapshots never expose hole cards to anyone. Private cards
  are cleared by `completeHand`.

`legalActionsByPlayerId` is a map keyed by `playerId`. Only the active player
will have a non-empty list; all other entries are `[]`. This allows the UI to
uniformly render action buttons keyed by seat without conditionals.

## 9. Serialization and Hydration

- `serializeTable(table) → SerializedTableState` produces a JSON-safe,
  deterministic snapshot of full internal state. It omits the `rng` function
  and tags the payload with `version: 1`.
- `hydrateTable(serialized, { rng })` reconstructs a working `TableState` and
  requires an injected `rng`. It validates required fields and rejects
  malformed input via `PokerEngineError`.
- A hydrated table can continue an active hand, complete a showdown, and start
  the next hand without divergence from the origin table.

## 10. Public API Surface

The following exports are stable:

- `createTable(config: TableConfig)`
- `seatPlayer(table, input: PlayerSeatInput)`
- `removePlayer(table, playerId: string)`
- `startHand(table)`
- `applyAction(table, intent: ActionIntent)`
- `getLegalActions(table, playerId: string)`
- `getPublicSnapshot(table)`
- `getPlayerSnapshot(table, playerId)`
- `getPlayerPrivateSnapshot(table, playerId)`
- `completeHand(table)`
- `serializeTable(table)`
- `hydrateTable(serialized, { rng })`
- `simulateDemoHand(seed)` / `createDemoSnapshots(seed)`

The `UIContract` namespace re-exports the public types and a set of
deterministic fixture snapshots generated from the engine itself. It does
**not** expose mutable internals.

## 11. Money Policy

- Chips are **play chips only**.
- The engine has no concept of real money, currency conversion, rake,
  payments, redemption, sweepstakes, or any cash-value feature.
- Callers that need those capabilities must build them outside this package
  and must not reinterpret chip counts as currency within the engine itself.

## 12. Versioning

This document describes contract version **1**, matching
`SerializedTableState.version`. Breaking changes to any section above require
bumping that number and providing a hydration migration path.
