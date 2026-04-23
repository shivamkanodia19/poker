import { useEffect, useRef, useState } from "react";
import type {
  GameSnapshot,
  PlayerPrivateSnapshot
} from "@engine";
import type { GameTransport, TransportEvent } from "../transport/types";

export type GameViewState = {
  snapshot: GameSnapshot | null;
  privateSnapshot: PlayerPrivateSnapshot | null;
  infoLog: { id: number; level: "info" | "error"; message: string }[];
};

export function useGame(transport: GameTransport | null): GameViewState {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [privateSnapshot, setPrivateSnapshot] = useState<PlayerPrivateSnapshot | null>(null);
  const [infoLog, setInfoLog] = useState<GameViewState["infoLog"]>([]);
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (!transport) return;
    const handler = (event: TransportEvent) => {
      if (event.type === "snapshot") {
        setSnapshot(event.snapshot);
      } else if (event.type === "private") {
        setPrivateSnapshot(event.snapshot);
      } else if (event.type === "info" || event.type === "error") {
        const level = event.type as "info" | "error";
        const message = event.message;
        setInfoLog((prev) => {
          const id = nextIdRef.current++;
          const next = [...prev, { id, level, message }];
          return next.slice(-6);
        });
      }
    };
    const unsub = transport.subscribe(handler);
    transport.connect().catch((err) => {
      const id = nextIdRef.current++;
      setInfoLog((prev) => [...prev, { id, level: "error" as const, message: (err as Error).message }].slice(-6));
    });
    return () => {
      unsub();
    };
  }, [transport]);

  return { snapshot, privateSnapshot, infoLog };
}
