import type { SeatSnapshot, Card } from "@engine";
import { CardView } from "./CardView";
import { formatChips } from "./ChipStack";

type Props = {
  seat: SeatSnapshot;
  isDealer: boolean;
  isActive: boolean;
  holeCards?: Card[];
  showdownCards?: Card[];
  isHero: boolean;
  position: { top: string; left: string };
  positionLabel?: string; // BTN / SB / BB / UTG / MP / CO
};

/** Deterministic hue from player name so each player gets a consistent avatar colour */
function nameHue(name: string): number {
  return [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0) % 360;
}

function PlayerAvatar({ name, isHero }: { name: string; isHero: boolean }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  const hue = nameHue(name);
  return (
    <div
      className={`seat__avatar${isHero ? " seat__avatar--hero" : ""}`}
      style={{
        background: `hsl(${hue}, 42%, 28%)`,
        border: `2px solid hsl(${hue}, 55%, 42%)`,
      }}
    >
      {initial}
    </div>
  );
}

export function SeatView({
  seat,
  isDealer,
  isActive,
  holeCards,
  showdownCards,
  isHero,
  position,
  positionLabel,
}: Props) {
  if (seat.status === "empty") {
    return (
      <div className="seat seat--empty" style={{ top: position.top, left: position.left }}>
        <span className="seat__empty-label">Open</span>
      </div>
    );
  }

  const cards = holeCards ?? showdownCards;
  const cardsKnown = !!cards && cards.length > 0;
  const faceDown =
    !cardsKnown &&
    seat.status !== "folded" &&
    (seat.status === "active" || seat.status === "allIn");
  const isFolded = seat.status === "folded";
  const isBusted = seat.status === "busted";

  const statusClass = [
    "seat",
    isHero ? "seat--hero" : "seat--opponent",
    isActive ? "seat--active" : "",
    isFolded ? "seat--folded" : "",
    isBusted ? "seat--busted" : "",
    seat.status === "allIn" ? "seat--allin" : "",
  ]
    .filter(Boolean)
    .join(" ");

  /* Hero hole cards show at md size; opponents at sm */
  const cardSize = isHero ? "md" : "sm";

  return (
    <div className={statusClass} style={{ top: position.top, left: position.left }}>
      {isDealer && <div className="seat__dealer-btn">D</div>}

      {/* Cards above the info box */}
      <div className="seat__cards">
        {faceDown && (
          <>
            <CardView faceDown size={cardSize} />
            <CardView faceDown size={cardSize} />
          </>
        )}
        {cardsKnown &&
          cards!.map((c, i) => (
            <CardView key={i} card={c} size={cardSize} dimmed={isFolded} />
          ))}
      </div>

      {/* Info box: avatar + name + stack */}
      <div className="seat__info" style={{ position: "relative" }}>
        <PlayerAvatar name={seat.displayName ?? "?"} isHero={isHero} />
        <span className="seat__name">{seat.displayName ?? "—"}</span>
        <span className="seat__stack">{formatChips(seat.stack)}</span>
        {positionLabel && <span className="seat__pos">{positionLabel}</span>}
        {seat.status === "allIn" && (
          <span className="seat__badge seat__badge--allin">ALL IN</span>
        )}
        {isFolded && <span className="seat__badge seat__badge--folded">FOLDED</span>}
      </div>

      {/* Bet chip */}
      {seat.committedThisStreet > 0 && (
        <div className="seat__bet">
          <div className="seat__bet-chip">
            <span className="seat__bet-amount">{formatChips(seat.committedThisStreet)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
