"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { TrafficPoint } from "@/lib/types";
export default function TrafficChart({
  data,
  hourly,
}: {
  data: TrafficPoint[];
  hourly: boolean;
}) {
  if (!data.some((p) => p.pageviews > 0))
    return (
      <div className="chart-empty">
        <p>Aún no hay tráfico en este periodo.</p>
        <span>Las visitas aparecerán aquí cuando Vercel las registre.</span>
      </div>
    );
  const format = (value: string) =>
    new Intl.DateTimeFormat("es", {
      timeZone: "UTC",
      ...(hourly ? { hour: "2-digit" } : { day: "numeric", month: "short" }),
    }).format(new Date(value));
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`Evolución de páginas vistas. ${data.map((p) => `${format(p.timestamp)}: ${p.pageviews}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: -22, right: 8, top: 12, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={format}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            dy={10}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(label) => format(String(label))}
            formatter={(value) => [
              Number(value).toLocaleString("es"),
              "Páginas vistas",
            ]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Area
            type="linear"
            dataKey="pageviews"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.08}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
