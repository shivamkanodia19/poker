# Future Data Model (Supabase + Authoritative Table Server)

## Principles

- Chips are **play chips only** (no cash value).
- All chip movements are **append-only ledger entries**.
- Live hand state is authoritative in a realtime table server.
- Database stores durable business facts, not client assertions.

## Core Entities

## `profiles`
- `id` (uuid, auth user id)
- `display_name`
- `created_at`

## `clubs`
- `id` (uuid)
- `name`
- `owner_profile_id`
- `is_private`
- `created_at`

## `club_members`
- `club_id`
- `profile_id`
- `role` (`owner` | `admin` | `member`)
- `status` (`active` | `invited` | `removed`)
- `created_at`

## `club_chip_accounts`
- `id`
- `club_id`
- `profile_id`
- `currency` (`PLAY_CHIPS`)
- `created_at`

Note: current balance is derived from ledger sum or maintained as cached projection.

## `chip_ledger_entries` (append-only)
- `id` (monotonic or uuid with created sequence)
- `club_id`
- `account_id`
- `entry_type`
  - `grant`
  - `table_buy_in_debit`
  - `table_cash_out_credit`
  - `club_adjustment`
- `amount` (signed integer chips)
- `reference_type` (`table_session`, `admin_adjustment`, etc.)
- `reference_id`
- `metadata` (jsonb)
- `created_by`
- `created_at`

Never update amounts in-place. Correct mistakes with compensating entries.

## `tables`
- `id`
- `club_id`
- `name`
- `small_blind`
- `big_blind`
- `max_players` (2-6)
- `status` (`open` | `in_progress` | `closed`)
- `created_at`

## `table_sessions`
- `id`
- `table_id`
- `started_at`
- `ended_at`
- `server_node_id`
- `status` (`active` | `closed`)

## `table_seats`
- `table_session_id`
- `seat_index`
- `profile_id`
- `buy_in_amount`
- `stack_at_join`
- `stack_at_leave`
- `status`

## `hands`
- `id`
- `table_session_id`
- `hand_number`
- `started_at`
- `completed_at`
- `dealer_seat`
- `board_cards` (jsonb)
- `result_summary` (jsonb)

## `hand_events`
- `id`
- `hand_id`
- `sequence_no`
- `event_type`
- `payload` (jsonb)
- `created_at`

This stores auditable action/event history from authoritative server decisions.

## Runtime Ownership Model

- Client sends `ActionIntent`.
- Realtime table server validates turn/order/legal action.
- Server mutates in-memory engine state.
- Server appends authoritative hand events.
- Server emits snapshots to participants.
- Clients never mutate game state directly.

## Buy-In/Cash-Out Flow

1. Player joins a club table with buy-in request.
2. Server validates available club chip balance.
3. Server writes `table_buy_in_debit` ledger entry.
4. Runtime seats player with table stack.
5. On leave/table close, server writes `table_cash_out_credit`.
6. Club balance projection updates from ledger.

Every movement is traceable and reversible via compensating entries.
