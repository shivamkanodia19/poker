import type { Card, Suit } from "@engine";

type Props = {
  card?: Card;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  dimmed?: boolean;
};

const SUIT_SYMBOL: Record<Suit, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠"
};

/** Red for hearts/diamonds; near-black for spades/clubs — classic casino two-colour deck */
const SUIT_COLOR: Record<Suit, string> = {
  c: "#1a1a1a",
  d: "#c0392b",
  h: "#c0392b",
  s: "#1a1a1a"
};

const RANK_DISPLAY: Record<string, string> = {
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A"
};

export function CardView({ card, faceDown = false, size = "md", dimmed = false }: Props) {
  const baseClass = `card card--${size}`;

  if (faceDown) {
    return <div className={`${baseClass} card--back${dimmed ? " card--dimmed" : ""}`} />;
  }

  /* No card and not face-down → ghost placeholder (undealt board slot) */
  if (!card) {
    return <div className={`${baseClass} card--ghost`} />;
  }

  const rank = RANK_DISPLAY[card.rank] ?? card.rank;
  const suit = SUIT_SYMBOL[card.suit];
  const color = SUIT_COLOR[card.suit];

  return (
    <div
      className={`${baseClass} card--face${dimmed ? " card--dimmed" : ""}`}
      style={{ "--card-color": color } as React.CSSProperties}
    >
      {/* Top-left corner index */}
      <div className="card__corner card__corner--tl">
        <span className="card__corner-rank">{rank}</span>
        <span className="card__corner-suit">{suit}</span>
      </div>

      {/* Centre suit symbol (md and lg only) */}
      {size !== "sm" && (
        <span className="card__center">{suit}</span>
      )}

      {/* Bottom-right corner index (rotated 180°) */}
      <div className="card__corner card__corner--br">
        <span className="card__corner-rank">{rank}</span>
        <span className="card__corner-suit">{suit}</span>
      </div>
    </div>
  );
}
