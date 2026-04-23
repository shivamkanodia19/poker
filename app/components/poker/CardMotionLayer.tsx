/**
 * CardMotionLayer — UI-only overlay.
 *
 * Renders animated card shapes for three event types:
 *
 *   • dealCard     — card back flies from deck position → seat (staggered)
 *   • foldCards    — two card backs at a seat rise upward and fade
 *   • revealStreet — a golden flash appears at each new community card slot
 *
 * This layer never reads or mutates engine state.
 * It renders temporary visual duplicates only; the real seat/community
 * card components remain authoritative.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type {
  AnimEvent,
  DealCardEvent,
  FoldCardsEvent,
  RevealStreetEvent
} from "../../poker/animationEvents";

/** Mirror of SEAT_POSITIONS in PokerTable (numeric). */
const SEAT_PCT = [
  { top: 78, left: 50 }, // 0 hero
  { top: 55, left: 88 }, // 1
  { top: 20, left: 75 }, // 2
  { top: 10, left: 50 }, // 3
  { top: 20, left: 25 }, // 4
  { top: 55, left: 12 }, // 5
] as const;

/** Deck sits slightly right of center so deal arcs look natural. */
const DECK_PCT = { top: 50, left: 53 };

/** Community card row sits a bit above vertical center. */
const COMMUNITY_TOP_PCT = 44;

/** Width of one community card slot in pixels (card 52 + gap 4). */
const CARD_SLOT_PX = 56;

/** Card face dimensions for the animated duplicates. */
const CARD_W = 32;
const CARD_H = 44;

type Dims = { w: number; h: number };

function seatPx(idx: number, dims: Dims) {
  const p = SEAT_PCT[idx] ?? SEAT_PCT[0];
  return { x: (p.left / 100) * dims.w, y: (p.top / 100) * dims.h };
}

function deckPx(dims: Dims) {
  return {
    x: (DECK_PCT.left / 100) * dims.w,
    y: (DECK_PCT.top / 100) * dims.h
  };
}

function communityCardPx(slotIdx: number, dims: Dims) {
  return {
    x: dims.w / 2 + (slotIdx - 2) * CARD_SLOT_PX,
    y: dims.h * (COMMUNITY_TOP_PCT / 100)
  };
}

/** Shared card-back style: matches the table's felt colour palette. */
const cardBackStyle: React.CSSProperties = {
  position: "absolute",
  width: CARD_W,
  height: CARD_H,
  borderRadius: 4,
  background:
    "linear-gradient(145deg, #1e5535 0%, #0d3320 55%, #1e5535 100%)",
  border: "1px solid rgba(28, 84, 52, 0.9)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  color: "rgba(196, 164, 70, 0.35)",
  userSelect: "none"
};

type Props = {
  events: AnimEvent[];
  onDone: (id: number) => void;
};

export function CardMotionLayer({ events, onDone }: Props) {
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

  const dealEvents = events.filter((e): e is DealCardEvent => e.type === "dealCard");
  const foldEvents = events.filter((e): e is FoldCardsEvent => e.type === "foldCards");
  const revealEvents = events.filter((e): e is RevealStreetEvent => e.type === "revealStreet");

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}
    >
      <AnimatePresence>
        {dims.w > 0 &&
          /* ── Deal: card back flies from deck to seat ── */
          dealEvents.map((ev) => {
            const deck = deckPx(dims);
            const seat = seatPx(ev.seatIndex, dims);
            const dx = seat.x - deck.x;
            const dy = seat.y - deck.y;
            const delay = reduceMotion ? 0 : ev.dealOrder * 0.09;

            return (
              <motion.div
                key={ev.id}
                aria-hidden="true"
                style={{
                  ...cardBackStyle,
                  left: deck.x - CARD_W / 2,
                  top: deck.y - CARD_H / 2
                }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={
                  reduceMotion
                    ? { opacity: 0 }
                    : { x: dx, y: dy, opacity: 0 }
                }
                transition={{
                  x: { duration: 0.44, delay, ease: "easeOut" },
                  y: { duration: 0.44, delay, ease: "easeOut" },
                  opacity: { duration: 0.12, delay: delay + 0.32, ease: "easeIn" }
                }}
                onAnimationComplete={() => onDone(ev.id)}
              >
                ♠
              </motion.div>
            );
          })}

        {dims.w > 0 &&
          /* ── Fold: two cards at seat rise upward and disperse ── */
          foldEvents.flatMap((ev) => {
            const seat = seatPx(ev.seatIndex, dims);
            return [0, 1].map((ci) => {
              const xOff = (ci - 0.5) * 8; // slight horizontal spread
              const rotateTo = ci === 0 ? -14 : 14;
              return (
                <motion.div
                  key={`${ev.id}-fold-${ci}`}
                  aria-hidden="true"
                  style={{
                    ...cardBackStyle,
                    left: seat.x - CARD_W / 2 + xOff,
                    top: seat.y - CARD_H / 2
                  }}
                  initial={{ x: 0, y: 0, opacity: 0.75, rotate: 0 }}
                  animate={
                    reduceMotion
                      ? { opacity: 0 }
                      : { x: xOff * 2, y: -46, opacity: 0, rotate: rotateTo }
                  }
                  transition={{ duration: reduceMotion ? 0.05 : 0.36, ease: "easeOut" }}
                  onAnimationComplete={ci === 1 ? () => onDone(ev.id) : undefined}
                >
                  ♠
                </motion.div>
              );
            });
          })}

        {dims.w > 0 &&
          /* ── Reveal: a brief golden flash at each new community slot ── */
          revealEvents.flatMap((ev) =>
            Array.from({ length: ev.count }, (_, i) => {
              const slot = ev.startIndex + i;
              const pos = communityCardPx(slot, dims);
              const delay = reduceMotion ? 0 : i * 0.08;

              // Wider card size for community (52×72 lg)
              const CW = 52;
              const CH = 72;

              return (
                <motion.div
                  key={`${ev.id}-street-${i}`}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: pos.x - CW / 2,
                    top: pos.y - CH / 2,
                    width: CW,
                    height: CH,
                    borderRadius: 6,
                    background: "rgba(196, 164, 70, 0.14)",
                    border: "1px solid rgba(196, 164, 70, 0.28)"
                  }}
                  initial={{ opacity: 0, scale: 0.82, y: -6 }}
                  animate={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: [0, 0.55, 0], scale: [0.82, 1, 1], y: [-6, 0, 0] }
                  }
                  transition={{
                    duration: reduceMotion ? 0.05 : 0.42,
                    delay,
                    times: [0, 0.38, 1]
                  }}
                  onAnimationComplete={i === ev.count - 1 ? () => onDone(ev.id) : undefined}
                />
              );
            })
          )}
      </AnimatePresence>
    </div>
  );
}
