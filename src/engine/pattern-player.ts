// 短パターン再生 (こだま・知覚用)。RhythmEngine と同じ AudioContext を
// マスタークロックとして使い、Oscillator 合成のみ (外部アセットなし)。
// 拍列は一度に全スケジュールする (短パターンなので lookahead 分割は不要)。

export interface PatternHandle {
  /** 各オンセットの Context 時刻 (スケジュール時刻)。 */
  onsetTimes: number[];
  /** 最後の音が鳴り終わる頃に resolve。 */
  finished: Promise<void>;
  cancel(): void;
}

export class PatternPlayer {
  constructor(private ctx: AudioContext) {}

  /**
   * ioisSec のパターンを再生する。オンセット数は iois.length + 1。
   * onOnset は各音の発音タイミング (可聴に近い時刻) で呼ばれる (視覚同期用)。
   */
  play(
    ioisSec: number[],
    opts: { freq?: number; gain?: number; onOnset?: (i: number) => void } = {},
  ): PatternHandle {
    const { freq = 880, gain = 0.5, onOnset } = opts;
    const t0 = this.ctx.currentTime + 0.15;
    const onsetTimes: number[] = [t0];
    for (const ioi of ioisSec) {
      onsetTimes.push(onsetTimes[onsetTimes.length - 1] + ioi);
    }
    for (const t of onsetTimes) this.click(t, freq, gain);

    let cancelled = false;
    const timers: number[] = [];
    if (onOnset) {
      const latency =
        (this.ctx as unknown as { outputLatency?: number }).outputLatency ??
        this.ctx.baseLatency ??
        0;
      onsetTimes.forEach((t, i) => {
        const delayMs = Math.max(0, (t + latency - this.ctx.currentTime) * 1000);
        timers.push(window.setTimeout(() => !cancelled && onOnset(i), delayMs));
      });
    }

    const endMs =
      (onsetTimes[onsetTimes.length - 1] + 0.2 - this.ctx.currentTime) * 1000;
    const finished = new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, Math.max(0, endMs)));
    });

    return {
      onsetTimes,
      finished,
      cancel: () => {
        cancelled = true;
        timers.forEach((h) => clearTimeout(h));
      },
    };
  }

  /** フィードバック用の単発音 (即時)。 */
  ding(freq = 1320, gain = 0.4): void {
    this.click(this.ctx.currentTime + 0.01, freq, gain);
  }

  private click(time: number, freq: number, peak: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
