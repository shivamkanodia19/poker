import type { ActionIntent, GameSnapshot, PlayerPrivateSnapshot } from "@engine";
import type { GameTransport, TransportEvent, Unsubscribe } from "./types";

/**
 * Placeholder transport for online/multiplayer play.
 *
 * The intended wire protocol (subject to change when we spin up a server):
 *   client → server:
 *     { t: "join", roomCode, playerId, displayName, buyIn }
 *     { t: "start" }
 *     { t: "action", intent: ActionIntent }
 *   server → client:
 *     { t: "snapshot", snapshot: GameSnapshot }
 *     { t: "private",  snapshot: PlayerPrivateSnapshot }
 *     { t: "info" | "error", message: string }
 *
 * The server will own the engine, RNG, and deal cards — the client only
 * displays snapshots and forwards action intents. This class is the seam
 * where that wiring will plug in.
 */
export type RemoteTransportOptions = {
  playerId: string;
  displayName: string;
  buyIn: number;
  roomCode: string;
  wsUrl?: string;
};

export class RemoteTransport implements GameTransport {
  public readonly playerId: string;
  private readonly roomCode: string;
  private readonly wsUrl: string | undefined;
  private readonly displayName: string;
  private readonly buyIn: number;
  private listeners = new Set<(e: TransportEvent) => void>();
  private ws: WebSocket | null = null;
  private disposed = false;

  constructor(options: RemoteTransportOptions) {
    this.playerId = options.playerId;
    this.displayName = options.displayName;
    this.buyIn = options.buyIn;
    this.roomCode = options.roomCode;
    this.wsUrl = options.wsUrl;
  }

  async connect(): Promise<void> {
    if (!this.wsUrl) {
      this.emit({
        type: "info",
        message:
          "Multiplayer server is not configured yet. This screen is a framework for the online mode — single player is ready to play now."
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl as string);
      } catch (err) {
        reject(err);
        return;
      }
      const ws = this.ws!;
      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            t: "join",
            roomCode: this.roomCode,
            playerId: this.playerId,
            displayName: this.displayName,
            buyIn: this.buyIn
          })
        );
        this.emit({ type: "info", message: `Connected to room ${this.roomCode}.` });
        resolve();
      });
      ws.addEventListener("message", (ev) => this.onMessage(ev));
      ws.addEventListener("close", () => {
        if (!this.disposed) {
          this.emit({ type: "info", message: "Disconnected from server." });
        }
      });
      ws.addEventListener("error", () => {
        this.emit({ type: "error", message: "WebSocket error." });
        reject(new Error("websocket error"));
      });
    });
  }

  subscribe(cb: (event: TransportEvent) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async requestStartHand(): Promise<void> {
    this.send({ t: "start" });
  }

  async submitAction(action: ActionIntent): Promise<void> {
    this.send({ t: "action", intent: action });
  }

  dispose(): void {
    this.disposed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.listeners.clear();
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({
        type: "info",
        message: "Not connected — this is a framework placeholder until the server is live."
      });
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private onMessage(ev: MessageEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      this.emit({ type: "error", message: "Malformed server frame." });
      return;
    }
    if (!data || typeof data !== "object") return;
    const msg = data as { t?: string } & Record<string, unknown>;
    if (msg.t === "snapshot" && msg.snapshot) {
      this.emit({ type: "snapshot", snapshot: msg.snapshot as GameSnapshot });
    } else if (msg.t === "private" && msg.snapshot) {
      this.emit({ type: "private", snapshot: msg.snapshot as PlayerPrivateSnapshot });
    } else if (msg.t === "info" && typeof msg.message === "string") {
      this.emit({ type: "info", message: msg.message });
    } else if (msg.t === "error" && typeof msg.message === "string") {
      this.emit({ type: "error", message: msg.message });
    }
  }

  private emit(event: TransportEvent): void {
    for (const cb of this.listeners) cb(event);
  }
}
