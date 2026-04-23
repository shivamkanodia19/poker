import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSnapshot } from "@engine";
import { nextAnimId, type AnimEvent } from "./animationEvents";

/**
 * Compares consecutive GameSnapshot values and emits animation events.
 *
 * The engine snapshot remains the authoritative source of truth.
 * These events only drive temporary visual duplicates in the motion layers;
 * they do not delay, mutate, or gate any game logic.
 */
export function usePokerAnimationEvents(snapshot: GameSnapshot | null) {
  const prevRef = useRef<GameSnapshot | null>(null);
  const [events, setEvents] = useState<AnimEvent[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = snapshot;
    if (!snapshot) return;

    const next: AnimEvent[] = [];

    if (prev) {
      // 1. committedThisStreet increases → chip committed to pot
      for (let i = 0; i < snapshot.seats.length; i++) {
        const seat = snapshot.seats[i];
        const prevSeat = prev.seats[i];
        if (prevSeat && seat.committedThisStreet > prevSeat.committedThisStreet) {
          next.push({
            id: nextAnimId(),
            type: "commitChips",
            seatIndex: i,
            amount: seat.committedThisStreet - prevSeat.committedThisStreet
          });
        }
      }

      // 2. active/allIn → folded: cards fly off
      for (let i = 0; i < snapshot.seats.length; i++) {
        const seat = snapshot.seats[i];
        const prevSeat = prev.seats[i];
        if (
          prevSeat &&
          (prevSeat.status === "active" || prevSeat.status === "allIn") &&
          seat.status === "folded"
        ) {
          next.push({ id: nextAnimId(), type: "foldCards", seatIndex: i });
        }
      }

      // 3. community cards grew → reveal new card(s)
      if (snapshot.communityCards.length > prev.communityCards.length) {
        next.push({
          id: nextAnimId(),
          type: "revealStreet",
          count: snapshot.communityCards.length - prev.communityCards.length,
          startIndex: prev.communityCards.length
        });
      }

      // 5. phase → handComplete with payouts → award pot
      if (
        snapshot.phase === "handComplete" &&
        prev.phase !== "handComplete" &&
        snapshot.payoutSummary.length > 0
      ) {
        for (const payout of snapshot.payoutSummary) {
          next.push({
            id: nextAnimId(),
            type: "awardPot",
            toSeatIndex: payout.seatIndex,
            amount: payout.amount
          });
        }
      }
    }

    // 4. phase switches to preflop → deal cards to each occupied seat
    if (snapshot.phase === "preflop" && prev?.phase !== "preflop") {
      const dealerSeat = snapshot.dealerSeat ?? 0;
      const n = snapshot.seats.length;
      for (let i = 0; i < n; i++) {
        const seat = snapshot.seats[i];
        if (seat.status !== "empty" && seat.status !== "busted") {
          const dealOrder = (i - dealerSeat - 1 + n) % n;
          next.push({ id: nextAnimId(), type: "dealCard", seatIndex: i, dealOrder });
        }
      }
    }

    if (next.length > 0) {
      setEvents((cur) => [...cur, ...next]);
    }
  }, [snapshot]);

  const dismiss = useCallback((id: number) => {
    setEvents((cur) => cur.filter((e) => e.id !== id));
  }, []);

  return { events, dismiss };
}
