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
};

export function SeatView({ seat, isDealer, isActive, holeCards, showdownCards, isHero, position }: Props) {
  if (seat.status === "empty") {
    return (
      <div className="seat seat--empty" style={{ top: position.top, left: position.left }}>
        <span className="seat__empty-label">Empty</span>
      </div>
    );
  }

  const cards = holeCards ?? showdownCards;
  const cardsKnown = !!cards && cards.length > 0;
  const faceDown = !cardsKnown && seat.status !== "folded" && (seat.status === "active" || seat.status === "allIn");
  const isFolded = seat.status === "folded";
  const isBusted = seat.status === "busted";

  const statusClass = [
    "seat",
    isHero ? "seat--hero" : "seat--opponent",
    isActive ? "seat--active" : "",
    isFolded ? "seat--folded" : "",
    isBusted ? "seat--busted" : "",
    seat.status === "allIn" ? "seat--allin" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={statusClass} style={{ top: position.top, left: position.left }}>
      {isDealer && <div className="seat__dealer-btn">D</div>}

      <div className="seat__cards">
        {faceDown && (
          <>
            <CardView faceDown size="sm" />
            <CardView faceDown size="sm" />
          </>
        )}
        {cardsKnown &&
          cards!.map((c, i) => (
            <CardView key={i} card={c} size="sm" dimmed={isFolded} />
          ))}
      </div>

      <div className="seat__info">
        <span className="seat__name">{seat.displayName ?? "—"}</span>
        <span className="seat__stack">{formatChips(seat.stack)}</span>
        {seat.status === "allIn" && <span className="seat__badge seat__badge--allin">ALL IN</span>}
        {isFolded && <span className="seat__badge seat__badge--folded">FOLDED</span>}
      </div>

      {seat.committedThisStreet > 0 && (
        <div className="seat__bet">
          <span className="seat__bet-amount">{formatChips(seat.committedThisStreet)}</span>
        </div>
      )}
    </div>
  );
}
