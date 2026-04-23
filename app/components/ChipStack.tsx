type Props = {
  amount: number;
  label?: string;
};

export function ChipStack({ amount, label }: Props) {
  if (amount <= 0) return null;
  return (
    <div className="chip-stack">
      <div className="chip-stack__coin" />
      <span className="chip-stack__label">{label ?? formatChips(amount)}</span>
    </div>
  );
}

export function formatChips(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}
