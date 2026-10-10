"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  price: number;
  original: number | null;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "short" });
const fullFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", dateStyle: "medium", timeStyle: "short" });
const madFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function PriceChart({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-ink-mute">Au moins deux relevés sont nécessaires pour afficher une courbe ({points.length} relevé pour l'instant).</p>;
  }
  const hasOriginal = points.some((p) => p.original !== null);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v) => dateFmt.format(new Date(v))} fontSize={12} stroke="#64748b" />
          <YAxis tickFormatter={(v) => `${Math.round(v)}`} fontSize={12} stroke="#64748b" width={60} domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(v) => fullFmt.format(new Date(Number(v)))}
            formatter={(value: number, name: string) => [`${madFmt.format(value)} MAD`, name === "price" ? "Prix observé" : "Prix barré annoncé"]}
          />
          <Line type="stepAfter" dataKey="price" stroke="#0b8262" strokeWidth={2} dot={{ r: 3 }} name="price" isAnimationActive={false} />
          {hasOriginal && <Line type="stepAfter" dataKey="original" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="original" isAnimationActive={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
