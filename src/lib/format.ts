// Money as people read it: "$1,250", "−$288", and "+$2,045" when the sign matters.
export function usd(n: number, opts: { plus?: boolean } = {}) {
  const v = Math.round(n);
  const sign = v < 0 ? "−" : opts.plus && v > 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US")}`;
}
