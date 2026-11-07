"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon } from "@/components/report/icons";
import { LiveEcgCanvas } from "@/components/vitals/Charts";
import { connectSerial, isWebSerialSupported, SerialError } from "@/lib/serial";
import {
  MAX_RECORDING_S,
  MIN_RECORDING_S,
  formatDuration,
  parseDeviceLine,
  type VitalsAnalysis,
  type VitalsMsg,
} from "@/lib/vitals";

type Phase = "idle" | "connecting" | "live" | "recording" | "analyzing";
type Source = { kind: "usb" } | { kind: "demo"; scenario: string };

const ECG_WINDOW_S = 6;
const STALE_MS = 3000;

export function LiveMonitor({
  source,
  pregnancyMonth,
  activity,
  onResult,
}: {
  source: Source;
  pregnancyMonth: number | null;
  activity: "rest" | "exercise";
  onResult: (analysis: VitalsAnalysis) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<VitalsMsg | null>(null);
  const [leadsOff, setLeadsOff] = useState(false);
  const [stale, setStale] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [counts, setCounts] = useState({ valid: 0, invalid: 0 });
  const [demoDone, setDemoDone] = useState(false);

  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const helloRef = useRef<string | null>(null);
  const recRef = useRef<string[] | null>(null);
  const recStartRef = useRef(0);
  const lastDataRef = useRef(0);
  const countsRef = useRef({ valid: 0, invalid: 0 });
  const leadsOffRef = useRef(false);
  const hzRef = useRef(250);
  const emaRef = useRef<number | null>(null);
  const ecgBuf = useRef<Float32Array>(new Float32Array(250 * ECG_WINDOW_S));
  const demoLinesRef = useRef<string[]>([]);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const handleLine = useCallback((line: string) => {
    lastDataRef.current = Date.now();
    const msg = parseDeviceLine(line);
    if (!msg) {
      countsRef.current.invalid += 1;
      return;
    }
    countsRef.current.valid += 1;
    if (recRef.current && msg.t !== "hello") {
      recRef.current.push(line);
    }
    switch (msg.t) {
      case "hello":
        helloRef.current = line;
        if (msg.ecg_hz && msg.ecg_hz !== hzRef.current) {
          hzRef.current = msg.ecg_hz;
          ecgBuf.current = new Float32Array(msg.ecg_hz * ECG_WINDOW_S);
        }
        break;
      case "vitals":
        setLatest(msg);
        break;
      case "ecg": {
        if (msg.lo !== leadsOffRef.current) {
          leadsOffRef.current = msg.lo;
          setLeadsOff(msg.lo);
        }
        const buf = ecgBuf.current;
        const samples = msg.s.filter((v) => Number.isFinite(v));
        const n = Math.min(samples.length, buf.length);
        buf.copyWithin(0, n);
        for (let i = 0; i < n; i++) {
          const v = samples[samples.length - n + i];
          // Remove baseline wander for display (first-order high-pass, ~0.5 Hz).
          emaRef.current = emaRef.current === null ? v : emaRef.current + 0.012 * (v - emaRef.current);
          buf[buf.length - n + i] = msg.lo ? 0 : v - emaRef.current;
        }
        break;
      }
    }
  }, []);

  // 1 Hz housekeeping: counters, stale detection, recording timer + auto-stop.
  useEffect(() => {
    if (phase === "idle" || phase === "connecting") return;
    const id = setInterval(() => {
      setCounts({ ...countsRef.current });
      setStale(Date.now() - lastDataRef.current > STALE_MS);
      if (phaseRef.current === "recording") {
        const s = (Date.now() - recStartRef.current) / 1000;
        setElapsed(s);
        if (s >= MAX_RECORDING_S) void stopAndAnalyze();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopAndAnalyze reads refs only
  }, [phase]);

  useEffect(() => () => void stopRef.current?.(), []);

  function resetStream() {
    countsRef.current = { valid: 0, invalid: 0 };
    setCounts({ valid: 0, invalid: 0 });
    helloRef.current = null;
    recRef.current = null;
    emaRef.current = null;
    ecgBuf.current = new Float32Array(hzRef.current * ECG_WINDOW_S);
    lastDataRef.current = Date.now();
    leadsOffRef.current = false;
    setLatest(null);
    setLeadsOff(false);
    setStale(false);
    setElapsed(0);
    setDemoDone(false);
  }

  async function connect() {
    setError(null);
    resetStream();
    setPhase("connecting");
    try {
      if (source.kind === "usb") {
        const conn = await connectSerial(handleLine, (msg) => {
          setError(msg);
          setPhase("idle");
        });
        setLabel(conn.label);
        stopRef.current = () => conn.disconnect();
      } else {
        const res = await fetch(`/api/vitals/demo?scenario=${encodeURIComponent(source.scenario)}&seconds=150`);
        if (!res.ok) throw new Error("The sample device isn't available right now.");
        const { lines } = (await res.json()) as { lines: string[] };
        demoLinesRef.current = lines;
        setLabel("Sample device (simulated)");
        let i = 0;
        const t0 = performance.now();
        const timer = setInterval(() => {
          const now = performance.now() - t0;
          while (i < lines.length) {
            const ms = (parseDeviceLine(lines[i]) as { ms?: number } | null)?.ms ?? 0;
            if (ms > now) break;
            handleLine(lines[i]);
            i += 1;
          }
          if (i >= lines.length) {
            clearInterval(timer);
            setDemoDone(true);
          }
        }, 40);
        stopRef.current = async () => clearInterval(timer);
      }
      lastDataRef.current = Date.now();
      setPhase("live");
    } catch (e) {
      setError(e instanceof SerialError || e instanceof Error ? e.message : "Couldn't connect to the device.");
      setPhase("idle");
    }
  }

  async function disconnect() {
    const stop = stopRef.current;
    stopRef.current = null;
    recRef.current = null;
    await stop?.();
    setPhase("idle");
  }

  function startRecording() {
    recRef.current = [];
    recStartRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
  }

  async function analyzeLines(lines: string[]) {
    setPhase("analyzing");
    setError(null);
    try {
      const res = await fetch("/api/vitals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines, pregnancy_month: pregnancyMonth, activity }),
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = "";
        try {
          detail = (JSON.parse(text) as { detail?: string; error?: string }).detail ?? "";
        } catch {
          detail = "";
        }
        throw new Error(detail || "The analysis service is unavailable. Please try again.");
      }
      onResult(JSON.parse(text) as VitalsAnalysis);
      setPhase("live");
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the server. Check your internet connection." : e instanceof Error ? e.message : "Analysis failed.");
      setPhase("live");
    }
  }

  async function stopAndAnalyze() {
    const recorded = recRef.current ?? [];
    recRef.current = null;
    const lines = helloRef.current ? [helloRef.current, ...recorded] : recorded;
    await analyzeLines(lines);
  }

  const connected = phase === "live" || phase === "recording" || phase === "analyzing";
  const usbUnsupported = source.kind === "usb" && typeof window !== "undefined" && !isWebSerialSupported();
  const finger = latest?.finger ?? false;
  const canStop = elapsed >= MIN_RECORDING_S;

  if (!connected) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-base font-semibold">{source.kind === "usb" ? "Connect your MamaCare device" : "Start the sample device"}</h3>
        {source.kind === "usb" ? (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <li>Plug the device into this computer with its USB cable and switch it on.</li>
            <li>Stick the three ECG pads on (right chest, left chest, lower left ribs) and rest a fingertip on the light sensor.</li>
            <li>Click <b>Connect</b> and choose the device in the list (often “CP210x”, “CH340” or “USB serial”).</li>
          </ol>
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Streams simulated readings through the same pipeline as the real device, so you can see how monitoring and the
            report work. Results are marked as sample data.
          </p>
        )}
        {usbUnsupported ? (
          <div className="mt-4 flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertIcon size={18} className="mt-0.5 shrink-0" />
            This browser can’t read USB devices. Use Chrome or Edge on a computer, or import the device’s SD-card file instead.
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>
        ) : null}
        <button
          onClick={connect}
          disabled={phase === "connecting" || usbUnsupported}
          className="mt-5 h-11 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {phase === "connecting" ? "Connecting…" : source.kind === "usb" ? "Connect" : "Start sample device"}
        </button>
      </div>
    );
  }

  const tile = (title: string, value: string | number | null | undefined, unit: string, ok: boolean, hint: string) => (
    <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <div className="text-xs font-medium text-zinc-500">{title}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-3xl font-semibold tabular-nums ${ok ? "" : "text-zinc-300 dark:text-zinc-700"}`}>{ok && value != null ? value : "--"}</span>
        <span className="text-sm text-zinc-500">{unit}</span>
      </div>
      <div className="mt-1 h-4 text-[11px] text-zinc-500">{ok ? "" : hint}</div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {!stale ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /> : null}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${stale ? "bg-zinc-400" : "bg-emerald-500"}`} />
          </span>
          <span className="text-sm font-medium">{stale ? "Waiting for data" : "Receiving"}</span>
          <span className="text-xs text-zinc-500">· {label}</span>
        </div>
        <button onClick={disconnect} className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
          Disconnect
        </button>
      </header>

      {stale ? (
        <div className="flex gap-2.5 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertIcon size={18} className="mt-0.5 shrink-0" />
          {source.kind === "demo" && demoDone
            ? "The sample has finished. Analyse it, or disconnect and start again."
            : "No data from the device for a few seconds. Check the USB cable and that the device is switched on (115200 baud)."}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3 p-5">
        {tile("Heart rate", latest?.hr, "bpm", finger && latest?.hr != null, "Place finger on sensor")}
        {tile("Blood oxygen", latest?.spo2, "%", finger && latest?.spo2 != null, "Place finger on sensor")}
        {tile("Temperature", latest?.temp_c, "°C", latest?.temp_c != null, "No body sensor")}
      </div>

      <div className="relative mx-5 rounded-xl bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-3 pt-2 text-xs text-zinc-500">
          <span>ECG · last {ECG_WINDOW_S} s</span>
          {leadsOff ? <span className="font-medium text-amber-600">Electrode loose</span> : <span>{hzRef.current} Hz</span>}
        </div>
        <LiveEcgCanvas buffer={ecgBuf} leadsOff={leadsOff} />
      </div>

      <div className="space-y-3 p-5">
        {phase === "recording" || phase === "analyzing" ? (
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Recording {formatDuration(elapsed)}
              </span>
              <span className="text-xs text-zinc-500">{canStop ? "Ready to analyse" : `at least ${formatDuration(MIN_RECORDING_S)} needed`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.min(100, (elapsed / 120) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Sit comfortably and stay still. Record for <b>2–5 minutes</b> for the most reliable result.
          </p>
        )}

        {error ? <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</div> : null}

        <div className="flex flex-wrap gap-2">
          {phase === "live" ? (
            <button onClick={startRecording} className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500">
              Start recording
            </button>
          ) : (
            <button
              onClick={() => void stopAndAnalyze()}
              disabled={!canStop || phase === "analyzing"}
              className="h-11 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {phase === "analyzing" ? "Analysing…" : "Stop and analyse"}
            </button>
          )}
          {source.kind === "demo" && phase === "live" ? (
            <button
              onClick={() => void analyzeLines(demoLinesRef.current)}
              className="h-11 rounded-xl border border-zinc-200 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              Skip ahead: analyse the full sample
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-400">
          {counts.valid} readings received{counts.invalid ? ` · ${counts.invalid} unreadable lines ignored` : ""}
        </p>
      </div>
    </div>
  );
}
