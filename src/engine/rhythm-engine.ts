// rhythm-engine.ts
// ---------------------------------------------------------------------------
// Measurement-grade timing core. EVERYTHING scoreable (sync / echo / continue)
// sits on top of the signed asynchrony this module produces. Scoring windows,
// non-punishing asymmetry, praise — all of that is a pure policy layer above.
// If the numbers here are wrong, no policy above can fix it.
//
// Three coordinate systems must be reconciled:
//   1. tap events live in performance.now() ms
//   2. beats live in AudioContext.currentTime seconds
//   3. the child HEARS the beat outputLatency later than currentTime
// getOutputTimestamp() bridges (1)<->(2); outputLatency handles (3);
// deviceOffset (measured once per device) handles input latency.
//
// Two tracks share this measurement discipline (addendum A1-2):
//   - the audible pulse track (equal-interval beats, per-beat matching)
//   - the pattern track (beat-grid target onsets, nearest-target matching)
// ---------------------------------------------------------------------------

import { expandGrid, type GridCell } from '../core/patterns';

export interface Beat {
  index: number;
  contextTime: number; // when the click is scheduled to START (context domain)
  audibleTime: number; // contextTime + outputLatency: when it reaches the ears
}

export interface TapResult {
  tapContextTime: number; // tap mapped into the AudioContext time domain
  nearestBeat: Beat;
  asynchrony: number; // seconds. NEGATIVE = anticipation (early), POSITIVE = late.
}

// --- pattern track types (addendum A1-2) -----------------------------------

export interface TargetOnset {
  index: number; // position in the actual-onset sequence
  gridIndex: number; // 0..3 within the bar
  subIndex: number; // 0/1 within a split cell
  contextTime: number;
  audibleTime: number;
  /** local expected interval (sec) — the scoring denominator (A1-6). */
  expectedIOI: number;
}

export interface PatternCellEvent {
  gridIndex: number;
  subIndex: number;
  cell: GridCell;
  /** rest cells fire with sounding=false — their times are kept for the
   *  visual pulse cue (A1-5) even though nothing is synthesized. */
  sounding: boolean;
  contextTime: number;
  audibleTime: number;
}

export interface PatternSchedule {
  targets: TargetOnset[];
  events: PatternCellEvent[];
  barStartContext: number;
  barEndContext: number;
  barEndAudible: number;
  cancel(): void;
}

export interface PatternTapResult {
  tapContextTime: number;
  /** nearest target onset (raw measurement — no pass/fail here). */
  target: TargetOnset;
  asynchrony: number; // seconds. NEGATIVE = anticipation, POSITIVE = late.
  /** false = surplus tap matching no target (window set by the caller). */
  matched: boolean;
}

type BeatListener = (beat: Beat) => void;
type TapListener = (tap: TapResult) => void;
type PatternTapListener = (tap: PatternTapResult) => void;

const LOOKAHEAD = 0.1; // schedule 100 ms of audio ahead
const TICK_MS = 25; // coarse scheduler interval
const MATCH_WINDOW = 16; // how many recent beats we keep for tap matching

export class RhythmEngine {
  private ctx: AudioContext;
  private tempoBps = 2; // beats/sec. Default 120 bpm; recalibrated to child SMT.
  private nextBeatIndex = 0;
  private nextBeatTime = 0;
  private recentBeats: Beat[] = []; // for tap matching
  private visualQueue: Beat[] = []; // drained on rAF, fired at audibleTime
  private tickHandle: number | null = null;
  private rafHandle: number | null = null;
  private running = false;

  // fallback bridge if getOutputTimestamp() is unavailable/empty
  private perfMinusCtx = 0;

  /** One measured value (seconds), set by DEVICE calibration (parent, once per
   *  device). Compensates input latency: pointerdown fires after the real tap. */
  deviceOffset = 0;

  private beatListeners = new Set<BeatListener>();
  private tapListeners = new Set<TapListener>();
  private patternTapListeners = new Set<PatternTapListener>();

  // pattern-mode matching state (armed by the caller, A1-2). While armed,
  // handlePatternTap matches against these instead of the pulse beats.
  private patternTargets: TargetOnset[] = [];
  private patternMatchR = 0.5;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext();
  }

  get bpm(): number {
    return this.tempoBps * 60;
  }
  setBpm(bpm: number): void {
    this.tempoBps = bpm / 60;
  }

  onBeat(fn: BeatListener): () => void {
    this.beatListeners.add(fn);
    return () => this.beatListeners.delete(fn);
  }
  onTap(fn: TapListener): () => void {
    this.tapListeners.add(fn);
    return () => this.tapListeners.delete(fn);
  }
  onPatternTap(fn: PatternTapListener): () => void {
    this.patternTapListeners.add(fn);
    return () => this.patternTapListeners.delete(fn);
  }

  /** Must be called from a user gesture (tap/click) so audio can start. */
  async start(): Promise<void> {
    if (this.running) return;
    await this.ctx.resume();
    // capture a fallback bridge once, in case getOutputTimestamp() returns 0s
    this.perfMinusCtx = performance.now() / 1000 - this.ctx.currentTime;
    this.running = true;
    this.nextBeatIndex = 0;
    this.nextBeatTime = this.ctx.currentTime + 0.15; // small startup pad
    this.recentBeats = [];
    this.visualQueue = [];
    this.tickHandle = window.setInterval(() => this.schedule(), TICK_MS);
    this.rafHandle = requestAnimationFrame(this.drainVisuals);
  }

  stop(): void {
    this.running = false;
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.tickHandle = this.rafHandle = null;
    this.recentBeats = [];
    this.visualQueue = [];
  }

  // --- two-clock scheduler: coarse setInterval decides WHAT, AudioContext
  //     decides WHEN. Audio is sample-accurate; JS jitter never touches it. ---
  private schedule(): void {
    const outputLatency = this.outputLatency();
    while (this.nextBeatTime < this.ctx.currentTime + LOOKAHEAD) {
      const beat: Beat = {
        index: this.nextBeatIndex,
        contextTime: this.nextBeatTime,
        audibleTime: this.nextBeatTime + outputLatency,
      };
      this.scheduleClick(beat.contextTime);
      this.recentBeats.push(beat);
      this.visualQueue.push(beat);
      if (this.recentBeats.length > MATCH_WINDOW) this.recentBeats.shift();

      this.nextBeatIndex++;
      this.nextBeatTime += 1 / this.tempoBps;
    }
  }

  private scheduleClick(time: number): void {
    this.scheduleClickAt(time, 1000, 0.5);
  }

  private scheduleClickAt(time: number, freq: number, peak: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
    return osc;
  }

  // --- pattern track (addendum A1-2). Separate from the audible pulse; the
  //     same clock bridge / latency / deviceOffset discipline applies. ------

  /**
   * Expand a 4-cell beat grid at the given IBI and schedule its actual
   * onsets (audio synthesis only when `audible`). Rest-cell times are kept
   * in `events` for the pulse cue (A1-5). Does NOT arm tap matching —
   * call armPatternTargets with the schedule's targets for that.
   */
  schedulePattern(
    grid: GridCell[],
    ibiSec: number,
    opts: {
      startAt?: number; // context time; default now + 0.15
      audible?: boolean; // false = targets/events only (silent response bar)
      freq?: number;
      gain?: number;
      onEvent?: (e: PatternCellEvent) => void; // fired near audibleTime (UI cue)
    } = {},
  ): PatternSchedule {
    const { audible = true, freq = 880, gain = 0.5, onEvent } = opts;
    // refresh the fallback bridge (same discipline as start())
    this.perfMinusCtx = performance.now() / 1000 - this.ctx.currentTime;
    const start = opts.startAt ?? this.ctx.currentTime + 0.15;
    const latency = this.outputLatency();
    const { slots, onsets, barSec } = expandGrid(grid, ibiSec);
    const targets: TargetOnset[] = onsets.map((o, index) => ({
      index,
      gridIndex: o.gridIndex,
      subIndex: o.subIndex,
      contextTime: start + o.offsetSec,
      audibleTime: start + o.offsetSec + latency,
      expectedIOI: o.expectedIoiSec,
    }));
    const events: PatternCellEvent[] = slots.map((s) => ({
      gridIndex: s.gridIndex,
      subIndex: s.subIndex,
      cell: s.cell,
      sounding: s.sounding,
      contextTime: start + s.offsetSec,
      audibleTime: start + s.offsetSec + latency,
    }));
    const oscs = audible
      ? targets.map((t) => this.scheduleClickAt(t.contextTime, freq, gain))
      : [];

    // UI cues via setTimeout are display-only — never a timing source.
    let cancelled = false;
    const timers: number[] = [];
    if (onEvent) {
      for (const e of events) {
        const delayMs = Math.max(0, (e.audibleTime - this.ctx.currentTime) * 1000);
        timers.push(window.setTimeout(() => !cancelled && onEvent(e), delayMs));
      }
    }
    return {
      targets,
      events,
      barStartContext: start,
      barEndContext: start + barSec,
      barEndAudible: start + barSec + latency,
      cancel: () => {
        cancelled = true;
        timers.forEach((h) => clearTimeout(h));
        oscs.forEach((o) => o.stop());
      },
    };
  }

  /** Arm nearest-target matching. matchWindowR is policy (|async|/expectedIOI
   *  bound for matched=true) and is injected by the layer above. */
  armPatternTargets(targets: TargetOnset[], matchWindowR: number): void {
    this.patternTargets = targets;
    this.patternMatchR = matchWindowR;
  }

  clearPatternTargets(): void {
    this.patternTargets = [];
  }

  /** Pattern-mode counterpart of handleTap: match against the armed target
   *  onsets (the per-beat pulse matching is untouched, A1-2). Distributes
   *  raw signed asynchrony only — no pass/fail judgment. */
  handlePatternTap(perfTimeStamp: number): PatternTapResult | undefined {
    if (this.patternTargets.length === 0) return;
    const tapContextTime = this.toContextTime(perfTimeStamp) - this.deviceOffset;
    let best = this.patternTargets[0];
    let bestAbs = Infinity;
    for (const t of this.patternTargets) {
      const d = Math.abs(tapContextTime - t.audibleTime);
      if (d < bestAbs) {
        bestAbs = d;
        best = t;
      }
    }
    const asynchrony = tapContextTime - best.audibleTime;
    const result: PatternTapResult = {
      tapContextTime,
      target: best,
      asynchrony,
      matched: Math.abs(asynchrony) / best.expectedIOI <= this.patternMatchR,
    };
    this.patternTapListeners.forEach((fn) => fn(result));
    return result;
  }

  // Fire onBeat when the sound actually reaches the ears — aligned to audio,
  // NOT to scheduling. rAF + context-time comparison keeps visuals frame-tight.
  private drainVisuals = (): void => {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    while (this.visualQueue.length && this.visualQueue[0].audibleTime <= now) {
      const beat = this.visualQueue.shift()!;
      this.beatListeners.forEach((fn) => fn(beat));
    }
    this.rafHandle = requestAnimationFrame(this.drainVisuals);
  };

  // --- Tap capture. Pass event.timeStamp straight from a pointerdown handler. ---
  handleTap(perfTimeStamp: number): TapResult | undefined {
    const tapContextTime = this.toContextTime(perfTimeStamp) - this.deviceOffset;
    const nearest = this.nearestBeat(tapContextTime);
    if (!nearest) return;
    const result: TapResult = {
      tapContextTime,
      nearestBeat: nearest,
      asynchrony: tapContextTime - nearest.audibleTime,
    };
    this.tapListeners.forEach((fn) => fn(result));
    return result;
  }

  // map performance.now() ms -> AudioContext seconds via the audio clock bridge
  private toContextTime(perfMs: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    return perfMs / 1000 - this.perfMinusCtx; // fallback
  }

  private outputLatency(): number {
    // outputLatency is the honest "sound leaves the speaker" delay; some
    // browsers only expose baseLatency (buffer only). Prefer the former.
    return (this.ctx as any).outputLatency ?? this.ctx.baseLatency ?? 0;
  }

  private nearestBeat(t: number): Beat | null {
    let best: Beat | null = null;
    let bestAbs = Infinity;
    for (const b of this.recentBeats) {
      const d = Math.abs(t - b.audibleTime);
      if (d < bestAbs) {
        bestAbs = d;
        best = b;
      }
    }
    return best;
  }
}
