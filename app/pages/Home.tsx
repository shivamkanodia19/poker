import { useState } from "react";

export type HomeChoice =
  | { mode: "single"; displayName: string; buyIn: number; botCount: number }
  | { mode: "multiplayer"; displayName: string; buyIn: number; mpMode: "create" | "join"; roomCode?: string };

type Props = {
  onStart: (choice: HomeChoice) => void;
};

type Panel = "single" | "multiplayer" | null;

export function Home({ onStart }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [displayName, setDisplayName] = useState("Player");
  const [buyIn, setBuyIn] = useState(1000);
  const [botCount, setBotCount] = useState(5);
  const [mpMode, setMpMode] = useState<"create" | "join">("create");
  const [roomCode, setRoomCode] = useState("");

  const startSingle = () => {
    if (!displayName.trim()) return;
    onStart({ mode: "single", displayName: displayName.trim(), buyIn, botCount });
  };

  const startMulti = () => {
    if (!displayName.trim()) return;
    if (mpMode === "join" && !roomCode.trim()) return;
    onStart({
      mode: "multiplayer",
      displayName: displayName.trim(),
      buyIn,
      mpMode,
      roomCode: roomCode.trim() || undefined
    });
  };

  return (
    <div className="home">
      <div className="home__hero">
        <div className="home__logo">♠</div>
        <h1 className="home__title">Felt</h1>
        <p className="home__tagline">No-Limit Texas Hold'em</p>
      </div>

      {panel === null && (
        <div className="home__modes">
          <button className="mode-card" onClick={() => setPanel("single")}>
            <span className="mode-card__icon">🤖</span>
            <span className="mode-card__title">Single Player</span>
            <span className="mode-card__desc">Play against AI opponents</span>
          </button>
          <button className="mode-card mode-card--coming" onClick={() => setPanel("multiplayer")}>
            <span className="mode-card__icon">🌐</span>
            <span className="mode-card__title">Multiplayer</span>
            <span className="mode-card__desc">Play with friends online</span>
            <span className="mode-card__badge">Framework ready</span>
          </button>
        </div>
      )}

      {panel === "single" && (
        <div className="home__panel">
          <button className="btn btn--back" onClick={() => setPanel(null)}>← Back</button>
          <h2 className="home__panel-title">Single Player</h2>

          <label className="form-label">
            Your Name
            <input
              className="form-input"
              type="text"
              maxLength={18}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
            />
          </label>

          <label className="form-label">
            Buy-In Amount
            <div className="form-chips">
              {[500, 1000, 2500, 5000].map((v) => (
                <button
                  key={v}
                  className={`chip-btn ${buyIn === v ? "chip-btn--active" : ""}`}
                  onClick={() => setBuyIn(v)}
                >
                  ${v.toLocaleString()}
                </button>
              ))}
            </div>
          </label>

          <label className="form-label">
            Number of Opponents
            <div className="form-chips">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  className={`chip-btn ${botCount === v ? "chip-btn--active" : ""}`}
                  onClick={() => setBotCount(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </label>

          <button
            className="btn btn--primary btn--full"
            onClick={startSingle}
            disabled={!displayName.trim()}
          >
            Take a Seat
          </button>
        </div>
      )}

      {panel === "multiplayer" && (
        <div className="home__panel">
          <button className="btn btn--back" onClick={() => setPanel(null)}>← Back</button>
          <h2 className="home__panel-title">Multiplayer</h2>

          <div className="home__mp-notice">
            <span className="notice-icon">🚧</span>
            <p>
              The multiplayer framework is wired up and ready. A live server + WebSocket relay is needed to connect real players.
              You can still enter the lobby view below.
            </p>
          </div>

          <label className="form-label">
            Your Name
            <input
              className="form-input"
              type="text"
              maxLength={18}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
            />
          </label>

          <div className="form-tabs">
            <button
              className={`tab-btn ${mpMode === "create" ? "tab-btn--active" : ""}`}
              onClick={() => setMpMode("create")}
            >
              Create Room
            </button>
            <button
              className={`tab-btn ${mpMode === "join" ? "tab-btn--active" : ""}`}
              onClick={() => setMpMode("join")}
            >
              Join Room
            </button>
          </div>

          {mpMode === "join" && (
            <label className="form-label">
              Room Code
              <input
                className="form-input form-input--upper"
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
              />
            </label>
          )}

          <label className="form-label">
            Buy-In Amount
            <div className="form-chips">
              {[500, 1000, 2500, 5000].map((v) => (
                <button
                  key={v}
                  className={`chip-btn ${buyIn === v ? "chip-btn--active" : ""}`}
                  onClick={() => setBuyIn(v)}
                >
                  ${v.toLocaleString()}
                </button>
              ))}
            </div>
          </label>

          <button
            className="btn btn--primary btn--full"
            onClick={startMulti}
            disabled={!displayName.trim() || (mpMode === "join" && !roomCode.trim())}
          >
            {mpMode === "create" ? "Create Room" : "Join Room"}
          </button>
        </div>
      )}
    </div>
  );
}
