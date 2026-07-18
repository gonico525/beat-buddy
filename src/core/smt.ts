// SMT較正 (requirements §5.2)。子の自発運動テンポを自由タップから推定する。
// 「すきに叩いてね」→ 最大12タップ or 8秒 / 最初の1タップ破棄 / ITI<120msデバウンス /
// 中央値を 300–700ms にクランプ / 直近5 ITI の CV < 0.20 で収束確定。

import { coefficientOfVariation, median } from './scoring';

export const SMT_CONFIG = {
  maxTaps: 12,
  maxDurationMs: 8000,
  debounceItiMs: 120,
  clampMinMs: 300,
  clampMaxMs: 700,
  cvThreshold: 0.2,
  convergenceWindow: 5,
} as const;

export interface SmtResult {
  /** 中央値ITI (ms)。タップ不足で算出不能なら null。 */
  smtMs: number | null;
  /** クランプ範囲 300–700ms 内か。範囲外は再測定を促す。 */
  inRange: boolean;
  itisMs: number[];
  converged: boolean;
}

export class SmtCollector {
  private tapTimesMs: number[] = [];
  private itisMs: number[] = [];
  private converged = false;
  private done = false;

  /**
   * タップを1つ追加する (performance.now() 系 ms)。
   * 終了条件 (収束 / 上限タップ / 8秒) に達したら true を返す。
   */
  addTap(tMs: number): boolean {
    if (this.done) return true;
    const last = this.tapTimesMs[this.tapTimesMs.length - 1];
    if (last !== undefined && tMs - last < SMT_CONFIG.debounceItiMs) {
      return false; // 誤ダブルタップとして無視
    }
    this.tapTimesMs.push(tMs);
    if (this.tapTimesMs.length >= 2) {
      // 最初の1タップは破棄 = ITIは2タップ目以降から自然に始まる
      this.itisMs.push(tMs - last);
    }

    const w = SMT_CONFIG.convergenceWindow;
    if (this.itisMs.length >= w) {
      const recent = this.itisMs.slice(-w);
      if (coefficientOfVariation(recent) < SMT_CONFIG.cvThreshold) {
        this.converged = true;
        this.done = true;
      }
    }
    if (this.tapTimesMs.length >= SMT_CONFIG.maxTaps) this.done = true;
    if (tMs - this.tapTimesMs[0] >= SMT_CONFIG.maxDurationMs) this.done = true;
    return this.done;
  }

  /** 経過時間による打ち切り判定 (タイマーから呼ぶ)。 */
  timedOut(nowMs: number): boolean {
    if (this.done) return true;
    if (this.tapTimesMs.length > 0 && nowMs - this.tapTimesMs[0] >= SMT_CONFIG.maxDurationMs) {
      this.done = true;
    }
    return this.done;
  }

  get tapCount(): number {
    return this.tapTimesMs.length;
  }

  result(): SmtResult {
    if (this.itisMs.length === 0) {
      return { smtMs: null, inRange: false, itisMs: [], converged: false };
    }
    const smtMs = median(this.itisMs);
    const inRange =
      smtMs >= SMT_CONFIG.clampMinMs && smtMs <= SMT_CONFIG.clampMaxMs;
    return { smtMs, inRange, itisMs: [...this.itisMs], converged: this.converged };
  }
}
