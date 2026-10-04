'use client'
import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { EngagementHistoryPoint } from "@/lib/creator-mock";

interface Props {
  history: EngagementHistoryPoint[];
  height?: number;
  compact?: boolean;
}

export const EngagementTrendChart: React.FC<Props> = ({ history, height = 240, compact }) => {
  const data = history.map((h) => ({ month: h.month, score: h.dnaScore, er: +(h.er * 100).toFixed(1), posts: h.posts }));
  if (compact) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <Line type="monotone" dataKey="score" stroke="hsl(var(--k-orange))" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--k-cream2))" />
        <XAxis dataKey="month" stroke="hsl(var(--k-muted))" fontSize={12} />
        <YAxis yAxisId="l" stroke="hsl(var(--k-muted))" fontSize={12} domain={[40, 100]} />
        <YAxis yAxisId="r" orientation="right" stroke="hsl(var(--k-muted))" fontSize={12} domain={[0, 12]} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--k-ink))", border: "none", borderRadius: 8, color: "white", fontSize: 12 }}
          labelStyle={{ color: "white" }}
        />
        <Line yAxisId="l" type="monotone" dataKey="score" name="DNA Score" stroke="hsl(var(--k-orange))" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line yAxisId="r" type="monotone" dataKey="er"    name="ER %"      stroke="hsl(var(--k-amber))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default EngagementTrendChart;
