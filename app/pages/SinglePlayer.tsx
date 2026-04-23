import { useEffect, useMemo, useRef } from "react";
import { LocalTransport } from "../transport/LocalTransport";
import { useGame } from "../state/useGame";
import { PokerTable } from "../components/PokerTable";

type Props = {
  displayName: string;
  buyIn: number;
  botCount: number;
  onExit: () => void;
};

export function SinglePlayer({ displayName, buyIn, botCount, onExit }: Props) {
  const idRef = useRef(`human-${Date.now()}`);

  const transport = useMemo(
    () =>
      new LocalTransport({
        tableId: `local-${Date.now()}`,
        humanPlayerId: idRef.current,
        humanDisplayName: displayName,
        buyIn,
        botCount
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => transport.dispose();
  }, [transport]);

  const { snapshot, privateSnapshot, infoLog } = useGame(transport);

  if (!snapshot) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__spinner" />
        <p>Setting up table…</p>
      </div>
    );
  }

  return (
    <div className="game-screen">
      <PokerTable
        snapshot={snapshot}
        privateSnapshot={privateSnapshot}
        transport={transport}
        onExit={onExit}
      />
      {infoLog.length > 0 && (
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
