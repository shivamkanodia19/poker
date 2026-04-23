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

const SUIT_COLOR: Record<Suit, string> = {
  c: "#1a8c45",
  d: "#c0392b",
  h: "#c0392b",
  s: "#1a1a2e"
};

const RANK_DISPLAY: Record<string, string> = {
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A"
};

export function CardView({ card, faceDown = false, size = "md", dimmed = false }: Props) {
  const sizeClass = `card card--${size}`;
  const classes = [sizeClass, faceDown ? "card--back" : "card--face", dimmed ? "card--dimmed" : ""].join(" ").trim();

  if (!card || faceDown) {
    return <div className={classes} />;
  }

  const rank = RANK_DISPLAY[card.rank] ?? card.rank;
  const suit = SUIT_SYMBOL[card.suit];
  const color = SUIT_COLOR[card.suit];

  return (
    <div className={classes} style={{ "--card-color": color } as React.CSSProperties}>
      <span className="card__rank">{rank}</span>
      <span className="card__suit">{suit}</span>
    </div>
  );
}
