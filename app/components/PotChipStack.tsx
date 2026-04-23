/** Visual chip-tower display that scales with pot amount */

type Denom = {
  value: number;
  bg: string;
  rim: string;
  label: string;
};

const DENOMS: Denom[] = [
  { value: 10000, bg: "#1c3a6e", rim: "#4888e0", label: "10K" },
  { value: 1000,  bg: "#5e2080", rim: "#c068e0", label: "1K"  },
  { value: 500,   bg: "#1a1a1a", rim: "#c8a040", label: "500" },
  { value: 100,   bg: "#1a1a1a", rim: "#c8a040", label: "100" },
  { value: 25,    bg: "#0d5828", rim: "#38b060", label: "25"  },
  { value: 5,     bg: "#8c2020", rim: "#e05050", label: "5"   },
  { value: 1,     bg: "#c0ccd8", rim: "#5080b0", label: "1"   },
];

function breakdown(amount: number): { denom: Denom; count: number }[] {
  const result: { denom: Denom; count: number }[] = [];
  let rem = amount;
  for (const d of DENOMS) {
    const n = Math.floor(rem / d.value);
    if (n > 0) {
      result.push({ denom: d, count: n });
      rem -= n * d.value;
    }
  }
  return result;
}

function ChipTower({ bg, rim, count }: { bg: string; rim: string; count: number }) {
  const visible = Math.min(count, 7);
  const h = 12 + (visible - 1) * 4;

  return (
    <div style={{ position: "relative", width: 26, height: h + 10, flexShrink: 0 }}>
      {Array.from({ length: visible }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: i * 4,
            left: 0,
            width: 26,
            height: 12,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 35% 30%, color-mix(in srgb, ${bg} 70%, white), ${bg})`,
            border: `1.5px solid ${rim}`,
            boxShadow: `0 1px 3px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)`,
          }}
        />
      ))}
      {count > 7 && (
        <div
          style={{
            position: "absolute",
            top: -12,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 8,
            color: rim,
            fontWeight: 700,
            fontFamily: "'Space Mono', monospace",
            whiteSpace: "nowrap",
            letterSpacing: "0.5px",
          }}
        >
          ×{count}
        </div>
      )}
    </div>
  );
}

type Props = { amount: number };

export function PotChipStack({ amount }: Props) {
  if (amount <= 0) return null;
  const chips = breakdown(amount);

  return (
    <div className="pot-chips">
      <div className="pot-chips__towers">
        {chips.map(({ denom, count }) => (
          <div key={denom.value} className="pot-chips__tower-wrap">
            <ChipTower bg={denom.bg} rim={denom.rim} count={count} />
            <span className="pot-chips__tower-label" style={{ color: denom.rim }}>
              {denom.label}
            </span>
          </div>
        ))}
      </div>
      <div className="pot-chips__total">${amount.toLocaleString()}</div>
    </div>
  );
}
