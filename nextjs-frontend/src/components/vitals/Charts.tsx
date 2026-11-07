"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/** Line chart of a session trend with the normal range shaded. Responsive via viewBox. */
export function TrendChart({
  points,
  domain,
  normal,
  color,
  label,
  unit,
}: {
  points: [number, number][];
  domain: [number, number];
  normal?: [number, number];
  color: string;
  label: string;
  unit: string;
}) {
  const W = 520;
  const H = 170;
  const pad = { l: 34, r: 10, t: 26, b: 22 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;
  const [lo, hi] = domain;
  const y = (v: number) => pad.t + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * h;
  const t0 = points[0]?.[0] ?? 0;
  const span = Math.max(1, (points[points.length - 1]?.[0] ?? 1) - t0);
  const x = (t: number) => pad.l + ((t - t0) / span) * w;
  const path = points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} over the session`}>
        <text x={pad.l} y={14} className="fill-zinc-900 text-[12px] font-semibold dark:fill-zinc-100">{label}</text>
        {last ? (
          <text x={W - pad.r} y={14} textAnchor="end" className="fill-zinc-500 text-[11px]">
            last {Math.round(last[1] * 10) / 10} {unit}
          </text>
        ) : null}
        {normal ? (
          <rect x={pad.l} y={y(normal[1])} width={w} height={y(normal[0]) - y(normal[1])} className="fill-emerald-500/10" />
        ) : null}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-zinc-400 text-[10px]">{Math.round(v * 10) / 10}</text>
          </g>
        ))}
        {points.length > 1 ? (
          <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <text x={pad.l + w / 2} y={pad.t + h / 2} textAnchor="middle" className="fill-zinc-400 text-[11px]">No readings</text>
        )}
        <text x={pad.l} y={H - 5} className="fill-zinc-400 text-[10px]">0:00</text>
        <text x={pad.l + w} y={H - 5} textAnchor="end" className="fill-zinc-400 text-[10px]">
          {Math.floor(span / 60)}:{String(Math.round(span % 60)).padStart(2, "0")}
        </text>
      </svg>
      {normal ? <figcaption className="px-1 pt-1 text-[11px] text-zinc-500">Shaded: normal range {normal[0]}–{normal[1]} {unit}</figcaption> : null}
    </figure>
  );
}

/** ECG strip on standard paper: 25 mm/s, 10 mm/mV (1 mm = 1 grid unit). Dots mark detected beats. */
export function EcgStrip({ mv, hz, peaks }: { mv: number[]; hz: number; peaks: number[] }) {
  if (mv.length < 10 || hz <= 0) return null;
  const seconds = mv.length / hz;
  const pxPerS = 25; // 25 mm/s, 1 unit = 1 mm
  const lo = Math.min(...mv);
  const hi = Math.max(...mv);
  const height = Math.max(25, (hi - lo) * 10 + 10);
  const width = seconds * pxPerS;
  const yOf = (v: number) => height - 5 - (v - lo) * 10;
  const path = mv.map((v, i) => `${i ? "L" : "M"}${((i / hz) * pxPerS).toFixed(2)},${yOf(v).toFixed(2)}`).join("");

  return (
    <div className="overflow-x-auto rounded-xl border border-rose-100 bg-white dark:border-rose-950 dark:bg-zinc-950">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: `${Math.max(width * 4, 600)}px` }} className="block max-w-none" role="img" aria-label="ECG strip">
        <defs>
          <pattern id="ecg-small" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M1 0H0V1" fill="none" stroke="#fbe2ea" strokeWidth="0.06" />
          </pattern>
          <pattern id="ecg-big" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="url(#ecg-small)" />
            <path d="M5 0H0V5" fill="none" stroke="#f5b9cb" strokeWidth="0.12" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#ecg-big)" />
        <path d={path} fill="none" stroke="#18181b" strokeWidth={0.22} strokeLinejoin="round" />
        {peaks
          .filter((p) => p >= 0 && p < mv.length)
          .map((p) => (
            <circle key={p} cx={(p / hz) * pxPerS} cy={yOf(mv[p]) - 2} r={0.6} fill="#e11d48" />
          ))}
      </svg>
    </div>
  );
}

/**
 * Live ECG sweep, redrawn every animation frame from a ring buffer owned by the caller.
 * `buffer.current` holds display-ready samples (already baseline-corrected), oldest first.
 */
export function LiveEcgCanvas({ buffer, leadsOff }: { buffer: MutableRefObject<Float32Array>; leadsOff: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const { clientWidth: cw, clientHeight: ch } = canvas;
        if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
          canvas.width = cw * dpr;
          canvas.height = ch * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const data = buffer.current;
        let peak = 1e-6;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(225,29,72,0.08)";
        ctx.lineWidth = 1;
        for (let gx = 0; gx < cw; gx += 20) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, ch);
          ctx.stroke();
        }
        for (let gy = 0; gy < ch; gy += 20) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(cw, gy);
          ctx.stroke();
        }
        ctx.strokeStyle = leadsOff ? "#a1a1aa" : dark ? "#34d399" : "#059669";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const px = (i / (data.length - 1)) * cw;
          const py = ch / 2 - (data[i] / peak) * (ch * 0.42);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [buffer, leadsOff]);

  return <canvas ref={canvasRef} className="h-36 w-full" aria-label="Live ECG waveform" />;
}
