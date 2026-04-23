/**
 * ChipMotionLayer — UI-only overlay.
 *
 * Renders animated chip tokens for:
 *   • commitChips  — chip flies from seat → pot center
 *   • awardPot     — chip flies from pot center → winner seat
 *
 * This layer never reads or mutates engine state.
 * All positions are computed from the same percentage constants used by
 * SeatView so the tokens align with the real seat and pot positions.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { AnimEvent, CommitChipsEvent, AwardPotEvent } from "../../poker/animationEvents";

/** Mirror of SEAT_POSITIONS in PokerTable (numeric, no "%" suffix). */
const SEAT_PCT = [
  { top: 78, left: 50 }, // 0 hero
  { top: 55, left: 88 }, // 1
  { top: 20, left: 75 }, // 2
  { top: 10, left: 50 }, // 3
  { top: 20, left: 25 }, // 4
  { top: 55, left: 12 }, // 5
] as const;

const POT_PCT = { top: 50, left: 50 };

type Dims = { w: number; h: number };

function toPx(pct: { top: number; left: number }, dims: Dims) {
  return { x: (pct.left / 100) * dims.w, y: (pct.top / 100) * dims.h };
}

type ChipEvent = CommitChipsEvent | AwardPotEvent;

type Props = {
  events: AnimEvent[];
  onDone: (id: number) => void;
};

export function ChipMotionLayer({ events, onDone }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims>({ w: 0, h: 0 });
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chipEvents = events.filter(
    (e): e is ChipEvent => e.type === "commitChips" || e.type === "awardPot"
  );

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}
    >
      <AnimatePresence>
        {dims.w > 0 &&
          chipEvents.map((ev) => {
            const fromPct =
              ev.type === "commitChips"
                ? (SEAT_PCT[ev.seatIndex] ?? POT_PCT)
                : POT_PCT;
            const toPct =
              ev.type === "commitChips"
                ? POT_PCT
                : (SEAT_PCT[ev.toSeatIndex] ?? POT_PCT);

            const from = toPx(fromPct, dims);
            const to = toPx(toPct, dims);
            const dx = to.x - from.x;
            const dy = to.y - from.y;

            const isAward = ev.type === "awardPot";
            const duration = reduceMotion ? 0.05 : isAward ? 0.62 : 0.46;

            // Chip is centered via left/top offset by half chip size (7px)
            return (
              <motion.div
                key={ev.id}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: from.x - 7,
                  top: from.y - 7,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: isAward
                    ? "radial-gradient(circle at 35% 35%, #f5e47a 0%, #c8a030 70%, #8a6012 100%)"
                    : "radial-gradient(circle at 35% 35%, #e8c860 0%, #a07820 70%, #604810 100%)",
                  boxShadow: "0 1px 5px rgba(0,0,0,0.55)",
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={
                  reduceMotion
                    ? { opacity: 0, scale: 0.5 }
                    : { x: dx, y: dy, opacity: 0, scale: 0.6 }
                }
                transition={{ duration, ease: "easeIn" }}
                onAnimationComplete={() => onDone(ev.id)}
              />
            );
          })}
      </AnimatePresence>
    </div>
  );
}
