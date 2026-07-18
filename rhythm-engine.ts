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
// ---------------------------------------------------------------------------

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

type BeatListener = (beat: Beat) => void;
type TapListener = (tap: TapResult) => void;

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
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
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
