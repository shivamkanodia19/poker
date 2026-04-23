import type { Card } from "@engine";
import { CardView } from "./CardView";
import { PotChipStack } from "./PotChipStack";

type Props = {
  cards: Card[];
  phase: string;
  potTotal: number;
};

const PHASE_LABELS: Record<string, string> = {
  preflop:      "Pre-Flop",
  flop:         "Flop",
  turn:         "Turn",
  river:        "River",
  handComplete: "Showdown",
};

export function CommunityCards({ cards, phase, potTotal }: Props) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i]);
  const label = PHASE_LABELS[phase] ?? phase.toUpperCase();

  return (
    <div className="community">
      <div className="community__cards">
        {slots.map((card, i) => (
          <CardView key={i} card={card} size="lg" />
        ))}
      </div>

      {/* Phase label */}
      <div className="community__info">
        <span className="community__phase">{label}</span>
      </div>

      {/* Visual chip stack pot display */}
      {potTotal > 0 && <PotChipStack amount={potTotal} />}
    </div>
  );
}
