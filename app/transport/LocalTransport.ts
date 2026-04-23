import {
  applyAction,
  completeHand,
  createTable,
  getPlayerPrivateSnapshot,
  getPublicSnapshot,
  seatPlayer,
  startHand
} from "@engine";
import type {
  ActionIntent,
  GameSnapshot,
  PlayerPrivateSnapshot,
  TableState
} from "@engine";
import { decide } from "../ai/policy";
import type { GameTransport, TransportEvent, Unsubscribe } from "./types";

export type LocalTransportOptions = {
  tableId: string;
  humanPlayerId: string;
  humanDisplayName: string;
  buyIn: number;
  botCount: number;
  smallBlind?: number;
  bigBlind?: number;
  botNames?: string[];
  botThinkMs?: number;
  seed?: number;
};

const DEFAULT_BOT_NAMES = [
  "Raven",
  "Goose",
  "Fox",
  "Viper",
  "Maverick",
  "Phoenix",
  "Shadow",
  "Rook"
];

export class LocalTransport implements GameTransport {
  public readonly playerId: string;
  private readonly table: TableState;
  private readonly listeners = new Set<(e: TransportEvent) => void>();
  private readonly botThinkMs: number;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: LocalTransportOptions) {
    const {
      tableId,
      humanPlayerId,
      humanDisplayName,
      buyIn,
      botCount,
      smallBlind = 5,
      bigBlind = 10,
      botNames = DEFAULT_BOT_NAMES,
      botThinkMs = 900,
      seed
    } = options;
    this.playerId = humanPlayerId;
    this.botThinkMs = botThinkMs;

    const rng = seed !== undefined ? mulberry32(seed) : Math.random;
    this.table = createTable({
      tableId,
      smallBlind,
      bigBlind,
      maxPlayers: Math.min(6, Math.max(2, 1 + botCount)),
      rng
    });

    seatPlayer(this.table, {
      playerId: humanPlayerId,
      displayName: humanDisplayName,
      stack: buyIn,
      seatIndex: 0
    });

    for (let i = 0; i < botCount; i += 1) {
      seatPlayer(this.table, {
        playerId: `bot-${i + 1}`,
        displayName: botNames[i % botNames.length],
        stack: buyIn,
        seatIndex: i + 1
      });
    }
  }

  async connect(): Promise<void> {
    this.emit({ type: "info", message: "Local table ready." });
    this.broadcastSnapshots();
  }

  subscribe(cb: (event: TransportEvent) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async requestStartHand(): Promise<void> {
    if (this.disposed) return;
    if (this.table.phase !== "waiting" && this.table.phase !== "handComplete") return;
    try {
      startHand(this.table);
      this.broadcastSnapshots();
      this.scheduleBotIfNeeded();
    } catch (err) {
      this.emit({ type: "error", message: (err as Error).message });
    }
  }

  async submitAction(action: ActionIntent): Promise<void> {
    if (this.disposed) return;
    try {
      applyAction(this.table, action);
      this.broadcastSnapshots();
      this.handlePhaseTransitions();
    } catch (err) {
      this.emit({ type: "error", message: (err as Error).message });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    this.listeners.clear();
  }

  private handlePhaseTransitions(): void {
    if (this.table.phase === "showdown") {
      // Auto-complete showdown after a delay so UI can present the result.
      this.scheduleDelayed(1800, () => {
        if (this.table.phase === "showdown") {
          completeHand(this.table);
          this.broadcastSnapshots();
        }
      });
      return;
    }
    this.scheduleBotIfNeeded();
  }

  private scheduleBotIfNeeded(): void {
    if (this.disposed) return;
    const snap = getPublicSnapshot(this.table);
    if (snap.activeSeat === null) return;
    const seat = snap.seats[snap.activeSeat];
    if (!seat.playerId) return;
    if (seat.playerId === this.playerId) return; // human's turn
    this.scheduleDelayed(this.botThinkMs, () => this.runBot(seat.playerId as string));
  }

  private runBot(botId: string): void {
    if (this.disposed) return;
    const snap = getPublicSnapshot(this.table);
    if (snap.activeSeat === null) return;
    const seat = snap.seats[snap.activeSeat];
    if (seat.playerId !== botId) return;
    const legal = snap.legalActionsByPlayerId[botId] ?? [];
    if (legal.length === 0) return;

    const priv = getPlayerPrivateSnapshot(this.table, botId);
    const decision = decide({
      playerId: botId,
      holeCards: priv.cards,
      snapshot: snap,
      legal,
      rng: this.table.rng
    });

    const intent: ActionIntent = { type: decision.type, playerId: botId, amount: decision.amount };
    try {
      applyAction(this.table, intent);
      this.broadcastSnapshots();
      this.handlePhaseTransitions();
    } catch (err) {
      // Fallback: try to check or fold if the heuristic picked something illegal.
      const fallback: ActionIntent =
        legal.find((l) => l.type === "check")
          ? { type: "check", playerId: botId }
          : legal.find((l) => l.type === "call")
            ? { type: "call", playerId: botId, amount: legal.find((l) => l.type === "call")!.minAmount }
            : { type: "fold", playerId: botId };
      try {
        applyAction(this.table, fallback);
        this.broadcastSnapshots();
        this.handlePhaseTransitions();
      } catch (inner) {
        this.emit({ type: "error", message: `bot ${botId} failed: ${(err as Error).message}; fallback: ${(inner as Error).message}` });
      }
    }
  }

  private scheduleDelayed(ms: number, fn: () => void): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private broadcastSnapshots(): void {
    const pub: GameSnapshot = getPublicSnapshot(this.table);
    this.emit({ type: "snapshot", snapshot: pub });
    if (pub.seats.some((s) => s.playerId === this.playerId)) {
      const priv: PlayerPrivateSnapshot = getPlayerPrivateSnapshot(this.table, this.playerId);
      this.emit({ type: "private", snapshot: priv });
    }
  }

  private emit(event: TransportEvent): void {
    for (const cb of this.listeners) cb(event);
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
