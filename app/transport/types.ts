import type { ActionIntent, GameSnapshot, PlayerPrivateSnapshot } from "@engine";

/**
 * Transport abstraction that decouples the UI from how game state is produced.
 *
 * LocalTransport runs the engine in-memory and drives AI bots.
 * RemoteTransport (future) wraps a WebSocket session to an authoritative server.
 *
 * The contract is intentionally minimal: the UI subscribes to snapshots and
 * dispatches action intents; everything else is the transport's responsibility.
 */
export type Unsubscribe = () => void;

export type TransportEvent =
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "private"; snapshot: PlayerPrivateSnapshot }
  | { type: "info"; message: string }
  | { type: "error"; message: string };

export interface GameTransport {
  /** The local seat's playerId (the human controlling this client). */
  readonly playerId: string;

  /** Kick off any session handshake (connect to server, seat bots, etc). */
  connect(): Promise<void>;

  /** Subscribe to all events. Returns unsubscribe. */
  subscribe(cb: (event: TransportEvent) => void): Unsubscribe;

  /** Request the next hand be dealt (host-only for remote; always allowed locally between hands). */
  requestStartHand(): Promise<void>;

  /** Submit an action intent for the local player. */
  submitAction(action: ActionIntent): Promise<void>;

  /** Clean up timers / sockets. */
  dispose(): void;
}

export type TableDescriptor = {
  tableId: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
};
