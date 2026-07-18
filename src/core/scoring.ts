// 採点純関数レイヤー (requirements §7)。
// エンジンが配る生 asynchrony の上に乗る方針のみのレイヤーで、副作用を持たない。

/** 同期の段階。none は「反応なし」= 減点・降格なし (非対称採点)。 */
export type SyncGrade = 'perfect' | 'good' | 'none';

export interface SyncScore {
  /** 相対誤差 r = |async| / IBI。テンポに自動スケールする。 */
  r: number;
  grade: SyncGrade;
}

export const SYNC_PERFECT_R = 0.15;
export const SYNC_GOOD_R = 0.3;

export function scoreSync(asynchronySec: number, ibiSec: number): SyncScore {
  const r = Math.abs(asynchronySec) / ibiSec;
  const grade: SyncGrade =
    r <= SYNC_PERFECT_R ? 'perfect' : r <= SYNC_GOOD_R ? 'good' : 'none';
  return { r, grade };
}

export const ECHO_IOI_TOLERANCE = 0.3;

export interface EchoScore {
  onsetCountMatch: boolean;
  /** 各IOIの相対誤差 |resp - target| / target。オンセット数不一致時は比較できた分のみ。 */
  ioiErrors: number[];
  allIoisWithin: boolean;
  /** (a) オンセット数一致 かつ (b) 全IOI相対誤差 ≤ tolerance */
  ok: boolean;
}

export function scoreEcho(
  targetIois: number[],
  responseIois: number[],
  tolerance = ECHO_IOI_TOLERANCE,
): EchoScore {
  const onsetCountMatch = responseIois.length === targetIois.length;
  const n = Math.min(targetIois.length, responseIois.length);
  const ioiErrors: number[] = [];
  for (let i = 0; i < n; i++) {
    ioiErrors.push(Math.abs(responseIois[i] - targetIois[i]) / targetIois[i]);
  }
  const allIoisWithin =
    ioiErrors.length > 0 && ioiErrors.every((e) => e <= tolerance);
  return {
    onsetCountMatch,
    ioiErrors,
    allIoisWithin,
    ok: onsetCountMatch && allIoisWithin,
  };
}

/** 継続課題: 消音後タップITI中央値の、直前目標IBIからのドリフト率 (符号付き)。 */
export function driftRate(medianItiSec: number, targetIbiSec: number): number {
  return (medianItiSec - targetIbiSec) / targetIbiSec;
}

/** ドリフトが小さければポジティブ表示 (大でも記録のみ・罰しない)。 */
export const CONTINUATION_POSITIVE_DRIFT = 0.15;

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 変動係数 CV = 標準偏差 / 平均。SMT収束判定に使う。 */
export function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return Infinity;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return Infinity;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
}
