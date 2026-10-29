"use client";
// Small SVG/HTML chart kit following the dataviz rules: thin marks, hairline grid,
// one axis, legend for 2+ series, selective direct labels, hover tooltips that
// never gate a value (every chart has a table view), text in ink tokens only.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { colorOf, cvar } from "@/lib/players";
import { fmtPct, fmtRec, type Rec } from "@/lib/scoring";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ChartCard({ title, sub, legend, table, children, className = "" }: {
  title: string; sub?: string; legend?: ReactNode; table: ReactNode; children: ReactNode; className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <figure className={`chart-card ${className}`} style={{ margin: 0 }}>
      <div className="chart-head">
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        <div className="toggle" role="group" aria-label={`${title} view`}>
          <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>
      {view === "chart" ? (<>{legend}{children}</>) : <div className="tablewrap">{table}</div>}
    </figure>
  );
}

export function Legend({ items }: { items: { id: string; name: string }[] }) {
  return (
    <div className="legend">
      {items.map((s) => <span key={s.id}><i className="key" style={cvar(s.id)} />{s.name}</span>)}
    </div>
  );
}

/** Clean tick values covering [min, max]. */
function ticks(min: number, max: number, target = 5) {
  const span = Math.max(1, max - min);
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export interface LineSeries { id: string; name: string; values: number[] }

/** Multi-series line chart on one axis with a zero baseline, crosshair and tooltip. */
export function LineChart({ labels, series, highlight = [], format = (v) => `${v > 0 ? "+" : ""}${v}`, height = 260 }: {
  labels: string[]; series: LineSeries[]; highlight?: string[]; format?(v: number): string; height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const yt = ticks(Math.min(0, ...all), Math.max(0, ...all));
  // Leave room on the right for the end labels of highlighted series.
  const endChars = Math.max(0, ...series.filter((s) => highlight.includes(s.id)).map((s) => `${s.name} ${format(s.values.at(-1) ?? 0)}`.length));
  const m = { t: 12, r: Math.max(64, endChars * 6.6 + 16), b: 28, l: 36 };
  const W = Math.max(width, 280), H = height;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (i: number) => m.l + (labels.length < 2 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => m.t + ih - ((v - yt[0]) / (yt.at(-1)! - yt[0] || 1)) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = labels.length - 1;
  // Draw highlighted series last so they sit on top.
  const ordered = [...series].sort((a, b) => Number(highlight.includes(a.id)) - Number(highlight.includes(b.id)));

  // End labels only for highlighted series, nudged apart if they collide.
  const ends = series.filter((s) => highlight.includes(s.id)).map((s) => ({ s, y: y(s.values[last]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * iw;
    setHover(Math.max(0, Math.min(last, Math.round((px / iw) * last))));
  }

  return (
    <div className="viz" ref={ref}>
      {width > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Line chart: ${series.map((s) => `${s.name} ${format(s.values[last])}`).join(", ")}`}>
          {yt.map((v) => (
            <g key={v}>
              <line className={v === 0 ? "baseline" : "gridline"} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={m.l - 8} y={y(v) + 4} textAnchor="end">{format(v)}</text>
            </g>
          ))}
          {labels.map((l, i) => (
            (labels.length <= 10 || i % Math.ceil(labels.length / 8) === 0 || i === last) &&
            <text key={l} className="tick" x={x(i)} y={H - 8} textAnchor="middle">{l}</text>
          ))}
          {hover !== null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />}
          {ordered.map((s) => {
            const hi = highlight.length === 0 || highlight.includes(s.id);
            return (
              <g key={s.id} style={{ opacity: hi ? 1 : 0.55 }}>
                <path d={path(s.values)} fill="none" stroke={colorOf(s.id)} strokeWidth={s.id === "entry" ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(hover ?? last)} cy={y(s.values[hover ?? last])} r={4} fill={colorOf(s.id)} stroke="var(--surface)" strokeWidth={2} />
              </g>
            );
          })}
          {ends.map(({ s, y: ly }) => (
            <text key={s.id} className="lbl" x={W - m.r + 10} y={ly + 4}>{s.name} {format(s.values[last])}</text>
          ))}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" style={{ touchAction: "pan-y" }}
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="tip" style={{
          left: `${(x(hover) / W) * 100}%`, top: m.t + 4,
          transform: x(hover) / W > 0.55 ? "translate(calc(-100% - 12px), 0)" : "translate(12px, 0)",
        }}>
          <b>{labels[hover]}</b>
          {[...series].sort((a, b) => b.values[hover] - a.values[hover]).map((s) => (
            <div className="r" key={s.id}><i className="dot" style={cvar(s.id)} /><span>{s.name}</span><span>{format(s.values[hover])}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface HeatRow { id: string; name: string; cells: { rec: Rec | null; pct: number | null }[] }

/** Heat around .500: red (hot) above, blue (cold) below, grey at even. Saturates at ±.250. */
function heatStyle(p: number | null): CSSProperties {
  if (p === null) return {};
  const t = Math.max(-1, Math.min(1, (p - 0.5) / 0.25));
  // Heat: red (hot) for better, blue (cold) for worse.
  const pole = t >= 0 ? "var(--heat-hot)" : "var(--heat-cold)";
  const amt = Math.round(Math.abs(t) * 100);
  return { background: `color-mix(in oklab, ${pole} ${amt}%, var(--div-mid))`, color: Math.abs(t) > 0.55 ? "#fff" : "var(--ink)" };
}

export function Heatmap({ cols, rows, rowHead = 92, minCol = 52 }: { cols: string[]; rows: HeatRow[]; rowHead?: number; minCol?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(null), 4000); return () => clearTimeout(t); }, [tip]);
  const show = (e: React.SyntheticEvent<HTMLElement>, text: string) => {
    const b = box.current!.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, text });
  };
  return (
    <div className="viz" ref={box} onPointerLeave={() => setTip(null)}>
      <div className="tablewrap">
        <div className="heat" style={{ gridTemplateColumns: `${rowHead}px repeat(${cols.length}, minmax(${minCol}px, 1fr))`, minWidth: rowHead + cols.length * (minCol + 2) }}>
          <span />
          {cols.map((c) => <span key={c} className="hd">{c}</span>)}
          {rows.map((r) => (<RowCells key={r.id} r={r} cols={cols} show={show} />))}
        </div>
      </div>
      <div className="scale" aria-hidden><span>25%</span><i /><span>75%</span><span style={{ marginLeft: 8 }}>win rate · red = hot · blue = cold · grey = 50%</span></div>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  );
}

function RowCells({ r, cols, show }: { r: HeatRow; cols: string[]; show(e: React.SyntheticEvent<HTMLElement>, t: string): void }) {
  return (<>
    <span className="rh"><i className="dot" style={cvar(r.id)} />{r.name}</span>
    {r.cells.map((c, i) => {
      const text = `${r.name} · ${cols[i]}: ${c.rec ? `${fmtRec(c.rec)} (${fmtPct(c.rec)})` : "—"}`;
      return c.pct === null ? (
        <span key={i} className="hc empty" aria-label={text}>—</span>
      ) : (
        <button key={i} className="hc" style={heatStyle(c.pct)} aria-label={text}
          onPointerEnter={(e) => show(e, text)} onFocus={(e) => show(e, text)} onClick={(e) => show(e, text)}>
          {Math.round(c.pct * 100)}%
        </button>
      );
    })}
  </>);
}

/** Win-% gap in points: red (hot) when the row picker did better, blue (cold) when worse, grey at even. Full colour at ±15 pts. */
function diffStyle(d: number): CSSProperties {
  const t = Math.max(-1, Math.min(1, d / 15));
  // Heat: red (hot) for better, blue (cold) for worse.
  const pole = t >= 0 ? "var(--heat-hot)" : "var(--heat-cold)";
  const amt = Math.round(Math.abs(t) * 100);
  return { background: `color-mix(in oklab, ${pole} ${amt}%, var(--div-mid))`, color: Math.abs(t) > 0.55 ? "#fff" : "var(--ink)" };
}
const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0");

export interface DiffRow { id: string; name: string; cells: { a: Rec; b: Rec; diff: number | null }[] }

/** Heatmap of one picker's win-% gap against each column (another player, the entry, the majority). */
export function DiffHeatmap({ who, cols, rows, rowHead = 128, minCol = 60 }: { who: string; cols: string[]; rows: DiffRow[]; rowHead?: number; minCol?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(null), 4000); return () => clearTimeout(t); }, [tip]);
  const show = (e: React.SyntheticEvent<HTMLElement>, text: string) => {
    const b = box.current!.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, text });
  };
  return (
    <div className="viz" ref={box} onPointerLeave={() => setTip(null)}>
      <div className="tablewrap">
        <div className="heat" style={{ gridTemplateColumns: `${rowHead}px repeat(${cols.length}, minmax(${minCol}px, 1fr))`, minWidth: rowHead + cols.length * (minCol + 2) }}>
          <span />
          {cols.map((c) => <span key={c} className="hd">vs {c}</span>)}
          {rows.map((r) => (<Fragment key={r.id}>
            <span className="rh">{r.name}</span>
            {r.cells.map((c, i) => {
              const text = `${r.name}: ${who} ${fmtRec(c.a)} (${fmtPct(c.a)}) · ${cols[i]} ${fmtRec(c.b)} (${fmtPct(c.b)})`
                + (c.diff === null ? "" : ` · ${signed(c.diff)} pts`);
              return c.diff === null ? <span key={i} className="hc empty" aria-label={text}>—</span> : (
                <button key={i} className="hc" style={diffStyle(c.diff)} aria-label={text}
                  onPointerEnter={(e) => show(e, text)} onFocus={(e) => show(e, text)} onClick={(e) => show(e, text)}>
                  {signed(c.diff)}
                </button>
              );
            })}
          </Fragment>))}
        </div>
      </div>
      <div className="scale" aria-hidden><span>−15</span><i /><span>+15</span><span style={{ marginLeft: 8 }}>win-% points · red = {who} hotter · blue = colder · grey = even</span></div>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  );
}

export function DiffTable({ who, cols, rows }: { who: string; cols: string[]; rows: DiffRow[] }) {
  return (
    <table className="grid">
      <thead><tr><th />{cols.map((c) => <th key={c}>{who} vs {c}</th>)}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td>{r.name}</td>{r.cells.map((c, i) => <td key={i}>{fmtRec(c.a)} vs {fmtRec(c.b)}{c.diff === null ? "" : ` (${signed(c.diff)})`}</td>)}</tr>
      ))}</tbody>
    </table>
  );
}

export function HeatTable({ cols, rows }: { cols: string[]; rows: HeatRow[] }) {
  return (
    <table className="grid">
      <thead><tr><th>Picker</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td>{r.name}</td>{r.cells.map((c, i) => <td key={i}>{c.rec ? `${fmtRec(c.rec)}` : "—"}</td>)}</tr>
      ))}</tbody>
    </table>
  );
}

/** Horizontal win-% bars from a 0 baseline, with a .500 reference. One colour unless items carry identity. */
export function WinBars({ items }: { items: { id: string; label: string; sub?: string; rec: Rec; pct: number | null; color?: string }[] }) {
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="b" key={it.id} title={`${it.label}: ${fmtRec(it.rec)} (${fmtPct(it.rec)})`}>
          <span>{it.label}{it.sub && <span className="sub">{it.sub}</span>}</span>
          <span className="track">
            <span style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, background: "var(--axis)" }} aria-hidden />
            <span className="fill" style={{ display: "block", width: `${(it.pct ?? 0) * 100}%`, ["--c" as string]: it.color ?? "var(--accent)" } as CSSProperties} />
          </span>
          <span className="v">{fmtPct(it.rec)}<span className="sub">{fmtRec(it.rec)}</span></span>
        </div>
      ))}
      <div className="b" aria-hidden style={{ minHeight: 0 }}>
        <span /><span style={{ position: "relative", fontSize: ".72rem", color: "var(--faint)" }}><span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>.500</span></span><span />
      </div>
    </div>
  );
}
