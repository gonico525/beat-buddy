import { describe, expect, it } from 'vitest';
import {
  scoreSync,
  scoreEcho,
  driftRate,
  median,
  coefficientOfVariation,
} from '../src/core/scoring';

describe('scoreSync (§7)', () => {
  it('r ≤ 0.15 → ぴったり', () => {
    expect(scoreSync(0.05, 0.5).grade).toBe('perfect');
    expect(scoreSync(-0.075, 0.5).grade).toBe('perfect'); // 先取りも同等
    expect(scoreSync(0.075, 0.5).grade).toBe('perfect'); // 境界ちょうど
  });

  it('0.15 < r ≤ 0.30 → いいね', () => {
    expect(scoreSync(0.1, 0.5).grade).toBe('good');
    expect(scoreSync(-0.15, 0.5).grade).toBe('good'); // 境界ちょうど
  });

  it('r > 0.30 → 反応なし (罰しない)', () => {
    expect(scoreSync(0.2, 0.5).grade).toBe('none');
  });

  it('テンポに自動スケールする', () => {
    // 同じ 60ms のずれでも IBI 600ms なら r=0.1、IBI 300ms なら r=0.2
    expect(scoreSync(0.06, 0.6).grade).toBe('perfect');
    expect(scoreSync(0.06, 0.3).grade).toBe('good');
  });
});

describe('scoreEcho (§6.4)', () => {
  it('オンセット数一致 + 全IOI誤差 ≤ 0.30 で ok', () => {
    const s = scoreEcho([0.5], [0.6]); // 誤差 0.2
    expect(s.onsetCountMatch).toBe(true);
    expect(s.ok).toBe(true);
  });

  it('IOI誤差超過は ok にならない (が数値は記録される)', () => {
    const s = scoreEcho([0.5], [0.7]); // 誤差 0.4
    expect(s.ok).toBe(false);
    expect(s.ioiErrors[0]).toBeCloseTo(0.4);
  });

  it('オンセット数不一致は ok にならない', () => {
    expect(scoreEcho([0.5, 0.5], [0.5]).ok).toBe(false);
    expect(scoreEcho([0.5], [0.5, 0.5]).ok).toBe(false);
  });

  it('応答なしは ok にならない', () => {
    expect(scoreEcho([0.5], []).ok).toBe(false);
  });
});

describe('driftRate (§6.3 継続)', () => {
  it('符号付きドリフト率を返す', () => {
    expect(driftRate(0.55, 0.5)).toBeCloseTo(0.1); // 遅くなった
    expect(driftRate(0.45, 0.5)).toBeCloseTo(-0.1); // 速くなった
  });
});

describe('統計ヘルパー', () => {
  it('median: 奇数/偶数', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('cv: 一定列は0、ばらつきで増加', () => {
    expect(coefficientOfVariation([500, 500, 500])).toBe(0);
    expect(coefficientOfVariation([400, 600, 500])).toBeGreaterThan(0.1);
  });
});
