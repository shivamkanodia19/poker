import type { Card } from "@engine";
import { CardView } from "./CardView";

type Props = {
  cards: Card[];
  phase: string;
  potTotal: number;
};

export function CommunityCards({ cards, phase, potTotal }: Props) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i]);

  return (
    <div className="community">
      <div className="community__cards">
        {slots.map((card, i) => (
          <CardView key={i} card={card} size="lg" />
        ))}
      </div>
      <div className="community__info">
        <span className="community__phase">{phase.toUpperCase()}</span>
        {potTotal > 0 && (
          <span className="community__pot">
            Pot: <strong>${potTotal.toLocaleString()}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
