# Poker Platform Roadmap

## Goal

Build a trustworthy, server-authoritative private-club Texas Hold'em platform with persistent play chips (no real money, no redemption).

## Architecture Direction

1. **Frontend (Vercel)**
   - React/Next.js client for lobby, clubs, tables, and gameplay UI.
   - Client only sends `ActionIntent` commands and renders server snapshots.

2. **Core Engine (this repo)**
   - Pure TypeScript deterministic poker logic.
   - No direct network, storage, or UI dependencies.
   - Can run inside any authoritative runtime.

3. **Persistence + App Data (Supabase)**
   - Auth, user profiles, clubs, memberships.
   - Table metadata and hand archives.
   - Chip ledger and balances derived from append-only entries.

4. **Realtime Table Runtime**
   - First option: Node.js WebSocket table service.
   - Later option: Cloudflare Durable Objects for table-per-object authority.
   - Runtime owns live table state, applies intents, persists events, broadcasts snapshots.

## Delivery Phases

### Phase 1: Engine Foundations (Current)
- Deterministic Hold'em engine.
- Action validation and turn authority.
- Side pots, showdown, payouts.
- Snapshot APIs + serialization.
- High-confidence test suite.

### Phase 2: Runtime Integration
- Wrap engine in authoritative table process.
- Introduce intent command bus and event stream.
- Add idempotency keys and replay safety.

### Phase 3: Persistence Integration
- Persist hand events and terminal hand results.
- Persist chip ledger entries for buy-in/cash-out/transfers.
- Rebuild table state from serialized checkpoints + event replay.

### Phase 4: Multiplayer Product Features
- Club private tables and invites.
- Sit-in/sit-out, reconnect handling, timeouts.
- Table discovery and seat reservation UX.

### Phase 5: Operations and Hardening
- Metrics, tracing, anti-cheat checks.
- Crash recovery and failover strategy.
- Full audit tooling for chip and hand histories.
