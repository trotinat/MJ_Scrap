/**
 * Tiny inline-SVG price sparkline — no chart library, safe in a server
 * component. Draws the series scaled to the box, marks the latest point, and
 * colours by overall trend (down = good, green/proof; up = red/promo).
 */
export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) {
    return <span className="text-xs text-ink-mute">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values[values.length - 1]!;
  const first = values[0]!;
  const down = last < first;
  const color = last <= min ? "#0b8262" : down ? "#0b8262" : last > first ? "#d4452f" : "#94a3b8";
  const lastX = (values.length - 1) * stepX;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img" aria-label="Évolution du prix">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX.toFixed(1)} cy={y(last).toFixed(1)} r={2.5} fill={color} />
    </svg>
  );
}
