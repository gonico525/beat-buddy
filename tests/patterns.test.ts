// リズム型純関数のテスト (docs/addendum-a1-rhythm-patterns.md,
// docs/addendum-a2-echo-response.md)。
// グリッド展開・テンポ規則・型全体の照合/採点 (非対称の維持)・こだま出題プール・
// 形の採点 (A2) を検証する。

import { describe, expect, it } from 'vitest';
import {
  ECHO_PATTERNS,
  ECHO_PATTERN_GROUPS,
  ECHO_SHAPE_SCALE_MAX,
  ECHO_SHAPE_SCALE_MIN,
  GRID_CELLS,
  PATTERNS,
  PATTERN_GROUPS,
  PATTERN_MATCH_R,
  SPLIT_TEMPO_FACTOR,
  echoPatternsInGroup,
  endsWithRest,
  expandGrid,
  hasSplit,
  patternIbiSec,
  patternsInGroup,
  scoreEchoShape,
  scorePatternAttempt,
  type GridCell,
} from '../src/core/patterns';

describe('パターン集合 (A1-3)', () => {
  it('合計16パターン・IDは一意', () => {
    expect(PATTERNS).toHaveLength(16);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(16);
  });

  it('全型が4マスで、1マス目は休符でない (A1-1)', () => {
    for (const p of PATTERNS) {
      expect(p.cells).toHaveLength(GRID_CELLS);
      expect(p.cells[0]).not.toBe('rest');
    }
  });

  it('解禁グループ6つの内訳: 1/3/3/1/4/4 (L1〜L5網羅・L6選定)', () => {
    const sizes = PATTERN_GROUPS.map((g) => patternsInGroup(g.key).length);
    expect(sizes).toEqual([1, 3, 3, 1, 4, 4]);
  });

  it('gap グループは休符数・split グループは細分の有無が一致する', () => {
    for (const p of PATTERNS) {
      const rests = p.cells.filter((c) => c === 'rest').length;
      const splits = p.cells.filter((c) => c === 'split').length;
      if (p.group.startsWith('pattern_gap_')) {
        expect(rests).toBe(Number(p.group.slice('pattern_gap_'.length)));
        expect(splits).toBe(0);
      } else {
        expect(splits).toBe(1); // L5/L6 とも split は1つ
        if (p.group === 'pattern_split_1') expect(rests).toBe(0);
        else expect(rests).toBe(1);
      }
    }
  });
});

describe('expandGrid (A1-2)', () => {
  const ibi = 0.5;

  it('タタタタ: 4打点が等間隔・expectedIOI=IBI', () => {
    const { onsets, slots, barSec } = expandGrid(['hit', 'hit', 'hit', 'hit'], ibi);
    expect(onsets.map((o) => o.offsetSec)).toEqual([0, 0.5, 1.0, 1.5]);
    expect(onsets.every((o) => o.expectedIoiSec === ibi)).toBe(true);
    expect(slots).toHaveLength(4);
    expect(barSec).toBe(2.0);
  });

  it('タ・・タ: 休符マスも時刻を保持する (sounding=false)', () => {
    const cells: GridCell[] = ['hit', 'rest', 'rest', 'hit'];
    const { onsets, slots } = expandGrid(cells, ibi);
    expect(onsets.map((o) => o.offsetSec)).toEqual([0, 1.5]);
    const rests = slots.filter((s) => !s.sounding);
    expect(rests.map((s) => [s.gridIndex, s.offsetSec])).toEqual([
      [1, 0.5],
      [2, 1.0],
    ]);
  });

  it('split: 8分2つに分割され expectedIOI=IBI/2 (A1-6)', () => {
    const { onsets } = expandGrid(['hit', 'split', 'hit', 'hit'], ibi);
    expect(onsets.map((o) => o.offsetSec)).toEqual([0, 0.5, 0.75, 1.0, 1.5]);
    const sub = onsets.filter((o) => o.cell === 'split');
    expect(sub.map((o) => o.subIndex)).toEqual([0, 1]);
    expect(sub.every((o) => o.expectedIoiSec === ibi / 2)).toBe(true);
    expect(onsets.filter((o) => o.cell === 'hit').every((o) => o.expectedIoiSec === ibi)).toBe(true);
  });
});

describe('テンポ規則 (A1-4)', () => {
  const smt = 0.45;

  it('4分のみの型は基準IBI=SMT', () => {
    expect(patternIbiSec(['hit', 'hit', 'rest', 'hit'], smt)).toBe(smt);
  });

  it('細分を含む型は基準IBI=SMT×1.6', () => {
    const cells: GridCell[] = ['hit', 'split', 'hit', 'rest'];
    expect(hasSplit(cells)).toBe(true);
    expect(patternIbiSec(cells, smt)).toBeCloseTo(smt * SPLIT_TEMPO_FACTOR, 10);
  });
});

describe('scorePatternAttempt (A1-6)', () => {
  const ibi = 0.5;
  // タ・タタ 相当: 打点 0 / 1.0 / 1.5
  const targets = [0, 1.0, 1.5].map((t) => ({ timeSec: t, expectedIoiSec: ibi }));

  it('完全再現: 全ターゲットhit・余剰なし・complete', () => {
    const s = scorePatternAttempt(targets, [0, 1.0, 1.5]);
    expect(s.perTarget.every((t) => t.grade === 'perfect')).toBe(true);
    expect(s.allTargetsHit).toBe(true);
    expect(s.extraTaps).toBe(0);
    expect(s.complete).toBe(true);
  });

  it('休符位置のタップは matched:false で記録され、達成 (a) は罰されない (A1-6)', () => {
    // 0.5 = 休符マスの位置。両隣の打点から IBI 分離れ r=1.0 > 0.5 で余剰
    const s = scorePatternAttempt(targets, [0, 0.5, 1.0, 1.5]);
    expect(s.taps.filter((t) => !t.matched)).toHaveLength(1);
    expect(s.taps.find((t) => !t.matched)?.timeSec).toBe(0.5);
    expect(s.allTargetsHit).toBe(true); // (a) は成立のまま
    expect(s.extraTaps).toBe(1);
    expect(s.complete).toBe(false); // (b) は上乗せにのみ効く
  });

  it('タップ不足: 対応のないターゲットは hit=false・async=null', () => {
    const s = scorePatternAttempt(targets, [0, 1.02]);
    expect(s.perTarget[2].hit).toBe(false);
    expect(s.perTarget[2].asyncSec).toBeNull();
    expect(s.allTargetsHit).toBe(false);
  });

  it('符号約束: 先取りは負・遅れは正', () => {
    const s = scorePatternAttempt(targets, [-0.05, 1.06, 1.5]);
    expect(s.perTarget[0].asyncSec).toBeCloseTo(-0.05, 10);
    expect(s.perTarget[1].asyncSec).toBeCloseTo(0.06, 10);
  });

  it('段階境界は既存と同じ r≤0.15/≤0.30 で、分母は局所IOI', () => {
    const half = [{ timeSec: 1.0, expectedIoiSec: ibi / 2 }]; // 8分の打点
    // |async|=0.05 → r=0.2 (IBI/2基準): good。IBI基準なら0.1でperfectになってしまう
    const s = scorePatternAttempt(half, [1.05]);
    expect(s.perTarget[0].grade).toBe('good');
    const s2 = scorePatternAttempt(half, [1.03]); // r=0.12 → perfect
    expect(s2.perTarget[0].grade).toBe('perfect');
  });

  it('照合窓 PATTERN_MATCH_R を超えるタップは余剰扱い', () => {
    const one = [{ timeSec: 1.0, expectedIoiSec: ibi }];
    const inWindow = scorePatternAttempt(one, [1.0 + ibi * PATTERN_MATCH_R * 0.99]);
    expect(inWindow.taps[0].matched).toBe(true);
    const outWindow = scorePatternAttempt(one, [1.0 + ibi * PATTERN_MATCH_R * 1.01]);
    expect(outWindow.taps[0].matched).toBe(false);
  });

  it('割当は1対1: 同じターゲットに2タップは張り付かない', () => {
    const one = [{ timeSec: 1.0, expectedIoiSec: ibi }];
    const s = scorePatternAttempt(one, [0.98, 1.02]);
    expect(s.taps.filter((t) => t.matched)).toHaveLength(1);
    expect(s.extraTaps).toBe(1);
    expect(s.allTargetsHit).toBe(true);
  });
});

describe('こだま出題プール (A2-5)', () => {
  it('末尾が休符の型は除外され、10型が残る', () => {
    expect(ECHO_PATTERNS.every((p) => !endsWithRest(p.cells))).toBe(true);
    expect(ECHO_PATTERNS).toHaveLength(10);
    expect(PATTERNS.filter((p) => endsWithRest(p.cells))).toHaveLength(6);
  });

  it('空になったグループ (L4 タ・・・) は選択肢から消える', () => {
    expect(echoPatternsInGroup('pattern_gap_3')).toHaveLength(0);
    expect(ECHO_PATTERN_GROUPS.map((g) => g.key)).toEqual([
      'pattern_gap_0',
      'pattern_gap_1',
      'pattern_gap_2',
      'pattern_split_1',
      'pattern_split_2',
    ]);
  });

  it('全出題型は打点2つ以上 (スパン比 s が定義できる)', () => {
    for (const p of ECHO_PATTERNS) {
      expect(expandGrid(p.cells, 0.5).onsets.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('scoreEchoShape (A2-4)', () => {
  const ibi = 0.5;
  // タ・タタ 相当: 期待打点 0 / 1.0 / 1.5 (局所IOI=IBI)
  const expected = expandGrid(['hit', 'rest', 'hit', 'hit'], ibi).onsets;

  it('完全再現: s=1・全打点 perfect・ok', () => {
    const s = scoreEchoShape(expected, [0, 1.0, 1.5]);
    expect(s.onsetCountMatch).toBe(true);
    expect(s.scale).toBeCloseTo(1, 10);
    expect(s.scaleValid).toBe(true);
    expect(s.perOnset.every((o) => o.grade === 'perfect')).toBe(true);
    expect(s.allPerfect).toBe(true);
    expect(s.ok).toBe(true);
  });

  it('開始時刻は任意・テンポが違っても形が合えば正解 (A2-3, A2-4)', () => {
    // 7秒後に開始・1.3倍遅いテンポで同じ形
    const s = scoreEchoShape(expected, [7.0, 8.3, 8.95]);
    expect(s.scale).toBeCloseTo(1.3, 10);
    expect(s.allPerfect).toBe(true);
    expect(s.ok).toBe(true);
  });

  it('スケール域外 (0.5未満/2.0超) は無効扱い・ok=false (罰には使わない)', () => {
    const slow = scoreEchoShape(expected, [0, 2.2, 3.3]); // s=2.2
    expect(slow.scale).toBeGreaterThan(ECHO_SHAPE_SCALE_MAX);
    expect(slow.scaleValid).toBe(false);
    expect(slow.ok).toBe(false);
    const fast = scoreEchoShape(expected, [0, 0.5, 0.7]); // s≈0.467
    expect(fast.scale).toBeLessThan(ECHO_SHAPE_SCALE_MIN);
    expect(fast.scaleValid).toBe(false);
    expect(fast.ok).toBe(false);
  });

  it('打点数不一致は「形がちがった」= 記録のみ (scale=null)', () => {
    const s = scoreEchoShape(expected, [0, 1.0]);
    expect(s.onsetCountMatch).toBe(false);
    expect(s.scale).toBeNull();
    expect(s.perOnset).toHaveLength(0);
    expect(s.ok).toBe(false);
  });

  it('形ちがい (s妥当でも中間打点が外れ) は ok=false', () => {
    const s = scoreEchoShape(expected, [0, 0.5, 1.5]); // s=1, 中間が -0.5 ずれ
    expect(s.scaleValid).toBe(true);
    expect(s.perOnset[1].grade).toBe('none');
    expect(s.ok).toBe(false);
  });

  it('符号約束: 先取りは負・遅れは正 (子テンポ秒)', () => {
    const s = scoreEchoShape(expected, [0, 0.94, 1.5]);
    expect(s.perOnset[1].diffSec).toBeCloseTo(-0.06, 10);
    expect(s.perOnset[1].grade).toBe('perfect'); // r=0.12
  });

  it('分母は局所期待間隔×s: 8分のずれは IBI/2 基準で採点', () => {
    const withSplit = expandGrid(['hit', 'split', 'hit', 'hit'], ibi).onsets;
    // 8分の2打目 (0.75) を 0.06 遅らせる → r = 0.06 / 0.25 = 0.24: good
    // (分母が IBI なら r=0.12 で perfect になってしまう)
    const s = scoreEchoShape(withSplit, [0, 0.5, 0.81, 1.0, 1.5]);
    expect(s.scale).toBeCloseTo(1, 10);
    expect(s.perOnset[2].r).toBeCloseTo(0.24, 10);
    expect(s.perOnset[2].grade).toBe('good');
    expect(s.ok).toBe(true);
    expect(s.allPerfect).toBe(false);
  });

  it('スパン比の性質: 最初と最後の打点は構成上 r=0', () => {
    const s = scoreEchoShape(expected, [0, 1.11, 1.62]);
    expect(s.perOnset[0].r).toBeCloseTo(0, 10);
    expect(s.perOnset[2].r).toBeCloseTo(0, 10);
  });
});
