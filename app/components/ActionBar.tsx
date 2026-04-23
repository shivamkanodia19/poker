import { useState } from "react";
import type { LegalAction, ActionIntent } from "@engine";
import { formatChips } from "./ChipStack";

type Props = {
  legal: LegalAction[];
  playerId: string;
  bigBlind: number;
  potTotal: number;
  onAction: (intent: ActionIntent) => void;
  lastAction?: string;
};

export function ActionBar({ legal, playerId, bigBlind, potTotal, onAction, lastAction }: Props) {
  const [betInput, setBetInput] = useState<number | null>(null);

  const fold = legal.find((l) => l.type === "fold");
  const check = legal.find((l) => l.type === "check");
  const call = legal.find((l) => l.type === "call");
  const bet = legal.find((l) => l.type === "bet");
  const raise = legal.find((l) => l.type === "raise");
  const allIn = legal.find((l) => l.type === "allIn");

  const sizing = bet ?? raise;
  const minAmount = sizing?.minAmount ?? bigBlind;
  const maxAmount = sizing?.maxAmount ?? minAmount;

  const defaultBet = betInput ?? Math.min(maxAmount, Math.max(minAmount, Math.round(potTotal * 0.67)));

  const dispatch = (type: ActionIntent["type"], amount?: number) => {
    onAction({ type, playerId, amount });
    setBetInput(null);
  };

  const potSizes = [
    { label: "¼ Pot", value: Math.round(potTotal * 0.25) },
    { label: "½ Pot", value: Math.round(potTotal * 0.5) },
    { label: "¾ Pot", value: Math.round(potTotal * 0.75) },
    { label: "Pot", value: potTotal }
  ].filter((s) => s.value >= minAmount && s.value <= maxAmount);

  return (
    <div className="action-bar">
      {lastAction && <div className="action-history">{lastAction}</div>}
      {sizing && (
        <div className="action-bar__sizing">
          <div className="action-bar__pot-sizes">
            {potSizes.map((ps) => (
              <button
                key={ps.label}
                className="btn btn--size"
                onClick={() => setBetInput(clamp(ps.value, minAmount, maxAmount))}
              >
                {ps.label}
              </button>
            ))}
          </div>
          <div className="action-bar__slider-row">
            <input
              type="range"
              className="action-bar__slider"
              min={minAmount}
              max={maxAmount}
              step={bigBlind}
              value={defaultBet}
              onChange={(e) => setBetInput(Number(e.target.value))}
            />
            <span className="action-bar__bet-value">{formatChips(defaultBet)}</span>
          </div>
        </div>
      )}

      <div className="action-bar__buttons">
        {fold && (
          <button className="btn btn--fold" onClick={() => dispatch("fold")}>
            Fold
          </button>
        )}
        {check && (
          <button className="btn btn--check" onClick={() => dispatch("check")}>
            Check
          </button>
        )}
        {call && (() => {
          const callAmt = call.minAmount ?? 0;
          const potOdds = potTotal + callAmt > 0
            ? Math.round((callAmt / (potTotal + callAmt)) * 100)
            : 0;
          return (
            <button className="btn btn--call" onClick={() => dispatch("call", callAmt)}>
              Call {formatChips(callAmt)}
              {potOdds > 0 && <span style={{ fontSize: "0.7em", opacity: 0.75, marginLeft: 4 }}>({potOdds}%)</span>}
            </button>
          );
        })()}
        {bet && (
          <button className="btn btn--bet" onClick={() => dispatch("bet", defaultBet)}>
            Bet {formatChips(defaultBet)}
          </button>
        )}
        {raise && (
          <button className="btn btn--raise" onClick={() => dispatch("raise", defaultBet)}>
            Raise to {formatChips(defaultBet)}
          </button>
        )}
        {allIn && !raise && !bet && (
          <button className="btn btn--allin" onClick={() => dispatch("allIn")}>
            All In
          </button>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
