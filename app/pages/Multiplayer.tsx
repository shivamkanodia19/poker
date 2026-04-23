import { useEffect, useMemo, useRef } from "react";
import { RemoteTransport } from "../transport/RemoteTransport";
import { useGame } from "../state/useGame";
import { PokerTable } from "../components/PokerTable";

type Props = {
  displayName: string;
  buyIn: number;
  mode: "create" | "join";
  roomCode?: string;
  onExit: () => void;
};

export function Multiplayer({ displayName, buyIn, mode, roomCode, onExit }: Props) {
  const idRef = useRef(`mp-${Date.now()}`);
  const effectiveRoom = roomCode ?? generateRoomCode();

  const transport = useMemo(
    () =>
      new RemoteTransport({
        playerId: idRef.current,
        displayName,
        buyIn,
        roomCode: effectiveRoom
        // wsUrl: "wss://your-server.example.com" — uncomment when server is live
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => transport.dispose();
  }, [transport]);

  const { snapshot, privateSnapshot, infoLog } = useGame(transport);

  return (
    <div className="game-screen">
      {snapshot ? (
        <PokerTable
          snapshot={snapshot}
          privateSnapshot={privateSnapshot}
          transport={transport}
          onExit={onExit}
        />
      ) : (
        <div className="lobby">
          <div className="lobby__header">
            <button className="btn btn--back" onClick={onExit}>← Back</button>
            <h2 className="lobby__title">
              {mode === "create" ? "Your Room" : "Joining Room"}
            </h2>
          </div>

          <div className="lobby__room-code">
            <span className="lobby__room-label">Room Code</span>
            <span className="lobby__room-value">{effectiveRoom}</span>
          </div>

          <div className="lobby__status">
            {infoLog.map((entry) => (
              <div
                key={entry.id}
                className={`lobby__message lobby__message--${entry.level}`}
              >
                {entry.message}
              </div>
            ))}
            {infoLog.length === 0 && (
              <div className="lobby__message lobby__message--info">
                Connecting to server…
              </div>
            )}
          </div>

          <div className="lobby__players">
            <p className="lobby__you">
              <strong>{displayName}</strong> — ${buyIn.toLocaleString()} buy-in
            </p>
          </div>
        </div>
      )}

      {snapshot && infoLog.length > 0 && (
        <div className="info-log">
          {infoLog.map((entry) => (
            <div key={entry.id} className={`info-log__entry info-log__entry--${entry.level}`}>
              {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
