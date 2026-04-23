import type { GameSnapshot, PlayerPrivateSnapshot } from "@engine";
import type { GameTransport } from "../transport/types";
import { SeatView } from "./SeatView";
import { CommunityCards } from "./CommunityCards";
import { ActionBar } from "./ActionBar";
import { ChipMotionLayer } from "./poker/ChipMotionLayer";
import { CardMotionLayer } from "./poker/CardMotionLayer";
import { usePokerAnimationEvents } from "../poker/usePokerAnimationEvents";

type Props = {
  snapshot: GameSnapshot;
  privateSnapshot: PlayerPrivateSnapshot | null;
  transport: GameTransport;
  onExit: () => void;
};

/**
 * Seat positions on an oval table (percentage-based).
 * Supports 2-6 seats.  Seat 0 is always the hero (bottom-center).
 */
const SEAT_POSITIONS: { top: string; left: string }[] = [
  { top: "78%", left: "50%" },  // 0 hero
  { top: "55%", left: "88%" },  // 1
  { top: "20%", left: "75%" },  // 2
  { top: "10%", left: "50%" },  // 3
  { top: "20%", left: "25%" },  // 4
  { top: "55%", left: "12%" },  // 5
];

export function PokerTable({ snapshot, privateSnapshot, transport, onExit }: Props) {
  const { events, dismiss } = usePokerAnimationEvents(snapshot);
  const heroId = transport.playerId;
  const heroSeat = snapshot.seats.find((s) => s.playerId === heroId);
  const heroLegal = heroId ? (snapshot.legalActionsByPlayerId[heroId] ?? []) : [];
  const isHeroTurn = heroLegal.length > 0;

  const isTerminal = snapshot.phase === "handComplete" || snapshot.phase === "waiting";
  const canDeal = snapshot.phase === "waiting" || snapshot.phase === "handComplete";

  const winnerNames = snapshot.payoutSummary.map((p) => {
    const seat = snapshot.seats.find((s) => s.playerId === p.playerId);
    return `${seat?.displayName ?? p.playerId} wins $${p.amount.toLocaleString()}`;
  });

  return (
    <div className="poker-table-screen">
      <header className="table-header">
        <span className="table-header__blinds">
          ${snapshot.smallBlind}/${snapshot.bigBlind}
        </span>
        <button className="btn btn--exit" onClick={onExit}>
          Leave Table
        </button>
      </header>

      <div className="poker-table">
        <div className="table-felt">
          <CommunityCards
            cards={snapshot.communityCards}
            phase={snapshot.phase}
            potTotal={snapshot.potTotal}
          />

          {isTerminal && winnerNames.length > 0 && (
            <div className="winner-banner">
              {winnerNames.map((w, i) => (
                <div key={i} className="winner-banner__line">
                  {w}
                </div>
              ))}
              {canDeal && (
                <button
                  className="btn btn--deal"
                  onClick={() => transport.requestStartHand()}
                >
                  Deal Next Hand
                </button>
              )}
            </div>
          )}

          {canDeal && winnerNames.length === 0 && (
            <button
              className="btn btn--deal btn--deal-start"
              onClick={() => transport.requestStartHand()}
            >
              Deal
            </button>
          )}
        </div>

        {snapshot.seats.map((seat) => (
          <SeatView
            key={seat.seatIndex}
            seat={seat}
            isDealer={snapshot.dealerSeat === seat.seatIndex}
            isActive={snapshot.activeSeat === seat.seatIndex}
            holeCards={seat.playerId === heroId ? privateSnapshot?.cards : undefined}
            showdownCards={
              snapshot.showdownSeatIndexes.includes(seat.seatIndex)
                ? seat.cards
                : undefined
            }
            isHero={seat.playerId === heroId}
            position={SEAT_POSITIONS[seat.seatIndex] ?? SEAT_POSITIONS[0]}
          />
        ))}

        {/* Animation overlays — absolute, pointer-events: none, UI-only */}
        <CardMotionLayer events={events} onDone={dismiss} />
        <ChipMotionLayer events={events} onDone={dismiss} />
      </div>

      {isHeroTurn && heroId && (
        <ActionBar
          legal={heroLegal}
          playerId={heroId}
          bigBlind={snapshot.bigBlind}
          potTotal={snapshot.potTotal}
          onAction={(intent) => transport.submitAction(intent)}
        />
      )}

      {!isHeroTurn && heroSeat && snapshot.phase !== "waiting" && snapshot.phase !== "handComplete" && (
        <div className="waiting-indicator">
          Waiting for other players…
        </div>
      )}
    </div>
  );
}
