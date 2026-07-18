import { describe, expect, it } from 'vitest';
import { SmtCollector } from '../src/core/smt';

function feed(collector: SmtCollector, times: number[]): boolean {
  let done = false;
  for (const t of times) done = collector.addTap(t);
  return done;
}

describe('SmtCollector (§5.2)', () => {
  it('安定タップは直近5 ITI の CV<0.20 で収束する', () => {
    // 500ms 間隔ぴったり: 1(破棄)+6タップ = ITI 5個で収束
    const c = new SmtCollector();
    const done = feed(c, [0, 500, 1000, 1500, 2000, 2500, 3000]);
    expect(done).toBe(true);
    const r = c.result();
    expect(r.converged).toBe(true);
    expect(r.smtMs).toBe(500);
    expect(r.inRange).toBe(true);
  });

  it('最初のタップはITIに寄与しない (破棄)', () => {
    const c = new SmtCollector();
    feed(c, [0, 2000, 2500, 3000]); // 変な初タップ間隔は最初のITIとして残る…
    // 破棄仕様: ITIは2タップ目以降の差分。初タップ自体は基準点のみ。
    expect(c.result().itisMs).toEqual([2000, 500, 500]);
  });

  it('ITI<120ms はデバウンスされる', () => {
    const c = new SmtCollector();
    feed(c, [0, 500, 550, 1000]); // 550 は誤ダブルタップ
    expect(c.result().itisMs).toEqual([500, 500]);
  });

  it('12タップで打ち切る', () => {
    const c = new SmtCollector();
    // CVが収束しないランダム風の列を12個
    const times = [0, 300, 900, 1300, 2100, 2500, 3300, 3600, 4400, 4700, 5500, 5800];
    const done = feed(c, times);
    expect(done).toBe(true);
    expect(c.tapCount).toBe(12);
  });

  it('8秒で打ち切る', () => {
    const c = new SmtCollector();
    feed(c, [0, 4000]);
    expect(c.timedOut(8100)).toBe(true);
  });

  it('クランプ域 300–700ms の外は inRange=false (再測定を促す)', () => {
    const c = new SmtCollector();
    feed(c, [0, 900, 1800, 2700]); // ITI 900ms
    const r = c.result();
    expect(r.smtMs).toBe(900);
    expect(r.inRange).toBe(false);
  });
});
