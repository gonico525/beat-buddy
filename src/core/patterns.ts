// リズム型・休符・細分 (docs/addendum-a1-rhythm-patterns.md)。
// 4/4 固定・1小節=4マスのビートグリッド (A1-1)。純関数のみ・副作用なし。
// グリッドの展開 (expandGrid)・テンポ規則 (A1-4)・型全体の照合と採点
// (scorePatternAttempt, A1-6) を担う。エンジンは展開結果を実時刻に写すだけで、
// タイミング計測の作法は変えない (A1-2)。

import { scoreSync, type SyncGrade } from './scoring';

/** 1マスの内容 (A1-1)。split はマスを8分音符2つ「タタ」に分割する。 */
export type GridCell = 'hit' | 'rest' | 'split';

/** 1小節のマス数 (4分音符×4)。4拍子固定 (A1-0)。 */
export const GRID_CELLS = 4;

// --- グリッド展開 (A1-2) ----------------------------------------------------

export interface GridSlot {
  gridIndex: number;
  /** split 内の 0/1。hit/rest は常に 0。 */
  subIndex: 0 | 1;
  cell: GridCell;
  /** rest は false。時刻は保持する (採点・可視化に使う, A1-2)。 */
  sounding: boolean;
  /** 小節頭からのオフセット (秒)。 */
  offsetSec: number;
  /** 採点分母となる局所的な期待間隔 (A1-6: 8分は IBI/2)。 */
  expectedIoiSec: number;
}

export interface ExpandedGrid {
  /** rest を含む全スロット (休符の提示・可視化用)。 */
  slots: GridSlot[];
  /** sounding のみ = ターゲット打点列 (A1-1)。 */
  onsets: GridSlot[];
  barSec: number;
}

export function expandGrid(cells: GridCell[], ibiSec: number): ExpandedGrid {
  const slots: GridSlot[] = [];
  cells.forEach((cell, gridIndex) => {
    const base = gridIndex * ibiSec;
    if (cell === 'split') {
      slots.push(
        { gridIndex, subIndex: 0, cell, sounding: true, offsetSec: base, expectedIoiSec: ibiSec / 2 },
        { gridIndex, subIndex: 1, cell, sounding: true, offsetSec: base + ibiSec / 2, expectedIoiSec: ibiSec / 2 },
      );
    } else {
      slots.push({
        gridIndex,
        subIndex: 0,
        cell,
        sounding: cell === 'hit',
        offsetSec: base,
        expectedIoiSec: ibiSec,
      });
    }
  });
  return { slots, onsets: slots.filter((s) => s.sounding), barSec: cells.length * ibiSec };
}

// --- テンポ規則 (A1-4) ------------------------------------------------------

/** 細分型の基準 IBI = SMT×1.6 (8分の間隔が子のSMT付近に来る)。試遊後調整可 (A1-12)。 */
export const SPLIT_TEMPO_FACTOR = 1.6;

export function hasSplit(cells: GridCell[]): boolean {
  return cells.includes('split');
}

/** 型の基準 IBI: 4分のみ=SMT / 細分あり=SMT×1.6。型の練習中は固定 (A1-4)。 */
export function patternIbiSec(cells: GridCell[], smtSec: number): number {
  return hasSplit(cells) ? smtSec * SPLIT_TEMPO_FACTOR : smtSec;
}

// --- パターン集合と解禁グループ (A1-3, A1-8) --------------------------------

export type PatternGroupKey =
  | 'pattern_gap_0'
  | 'pattern_gap_1'
  | 'pattern_gap_2'
  | 'pattern_gap_3'
  | 'pattern_split_1'
  | 'pattern_split_2';

export interface PatternDef {
  /** マス列を h/r/s で符号化した ID (例 'hhrh')。記録にも使う (A1-7)。 */
  id: string;
  group: PatternGroupKey;
  cells: GridCell[];
  /** 表示用オノマトペ (タ/タン/タタ/・)。楽譜記号は使わない (A1-10)。 */
  label: string;
}

/** 全16型。L1〜L5 は全網羅、L6 は「歌える型」の選定4つ (A1-3)。 */
export const PATTERNS: PatternDef[] = [
  // 第1部: 4分のみ (1マス目固定・休符数で段階化・全網羅 8型)
  { id: 'hhhh', group: 'pattern_gap_0', cells: ['hit', 'hit', 'hit', 'hit'], label: 'タタタタ' },
  { id: 'hhhr', group: 'pattern_gap_1', cells: ['hit', 'hit', 'hit', 'rest'], label: 'タタタ・' },
  { id: 'hhrh', group: 'pattern_gap_1', cells: ['hit', 'hit', 'rest', 'hit'], label: 'タタ・タ' },
  { id: 'hrhh', group: 'pattern_gap_1', cells: ['hit', 'rest', 'hit', 'hit'], label: 'タ・タタ' },
  { id: 'hhrr', group: 'pattern_gap_2', cells: ['hit', 'hit', 'rest', 'rest'], label: 'タタ・・' },
  { id: 'hrhr', group: 'pattern_gap_2', cells: ['hit', 'rest', 'hit', 'rest'], label: 'タ・タ・' },
  { id: 'hrrh', group: 'pattern_gap_2', cells: ['hit', 'rest', 'rest', 'hit'], label: 'タ・・タ' },
  { id: 'hrrr', group: 'pattern_gap_3', cells: ['hit', 'rest', 'rest', 'rest'], label: 'タ・・・' },
  // 第2部: 8分の細分 (L5 全網羅 4型 / L6 選定 4型)
  { id: 'shhh', group: 'pattern_split_1', cells: ['split', 'hit', 'hit', 'hit'], label: 'タタ タン タン タン' },
  { id: 'hshh', group: 'pattern_split_1', cells: ['hit', 'split', 'hit', 'hit'], label: 'タン タタ タン タン' },
  { id: 'hhsh', group: 'pattern_split_1', cells: ['hit', 'hit', 'split', 'hit'], label: 'タン タン タタ タン' },
  { id: 'hhhs', group: 'pattern_split_1', cells: ['hit', 'hit', 'hit', 'split'], label: 'タン タン タン タタ' },
  { id: 'shhr', group: 'pattern_split_2', cells: ['split', 'hit', 'hit', 'rest'], label: 'タタ タン タン ・' },
  { id: 'shrh', group: 'pattern_split_2', cells: ['split', 'hit', 'rest', 'hit'], label: 'タタ タン ・ タン' },
  { id: 'hshr', group: 'pattern_split_2', cells: ['hit', 'split', 'hit', 'rest'], label: 'タン タタ タン ・' },
  { id: 'hsrh', group: 'pattern_split_2', cells: ['hit', 'split', 'rest', 'hit'], label: 'タン タタ ・ タン' },
];

/** 解禁グループ (推奨表示順, A1-8)。hasRest は継続解禁の推奨表示に使う (A1-5)。 */
export const PATTERN_GROUPS: { key: PatternGroupKey; kidLabel: string; hasRest: boolean }[] = [
  { key: 'pattern_gap_0', kidLabel: 'タタタタ', hasRest: false },
  { key: 'pattern_gap_1', kidLabel: 'おやすみ 1', hasRest: true },
  { key: 'pattern_gap_2', kidLabel: 'おやすみ 2', hasRest: true },
  { key: 'pattern_gap_3', kidLabel: 'おやすみ 3', hasRest: true },
  { key: 'pattern_split_1', kidLabel: 'タタ いり', hasRest: false },
  { key: 'pattern_split_2', kidLabel: 'タタ と おやすみ', hasRest: true },
];

export function patternsInGroup(key: PatternGroupKey): PatternDef[] {
  return PATTERNS.filter((p) => p.group === key);
}

// --- 型全体の照合・採点 (A1-6) ----------------------------------------------

/** 照合窓: |async| / expectedIOI ≤ 0.5 で「対応する打点」とみなす。
 *  これを超えるタップは matched: false = 余剰打点 (A1-2)。 */
export const PATTERN_MATCH_R = 0.5;

export interface PatternTargetLike {
  timeSec: number;
  expectedIoiSec: number;
}

export interface PatternTapAssignment {
  timeSec: number;
  /** false = どのターゲットにも対応しない余剰打点。罰には使わない (A1-6)。 */
  matched: boolean;
  targetIndex: number | null;
  /** 負=先取り/正=遅れ (符号約束は全レイヤー共通)。 */
  asyncSec: number | null;
}

export interface PatternTargetScore {
  asyncSec: number | null;
  r: number | null;
  grade: SyncGrade | null;
  /** 窓内 (r ≤ 0.30) のタップが対応した = 「正位置に打点がある」(A1-6a)。 */
  hit: boolean;
}

export interface PatternAttemptScore {
  perTarget: PatternTargetScore[];
  taps: PatternTapAssignment[];
  /** 余剰打点数。記録のみ・達成の上乗せ判定にのみ使う (A1-6b)。 */
  extraTaps: number;
  /** (a) 各ターゲットに窓内のタップが存在。 */
  allTargetsHit: boolean;
  /** (a) かつ (b) 余計な打点がない。ぴったり表示の条件で、罰には使わない。 */
  complete: boolean;
}

/**
 * タップ列をターゲット打点列に1対1で割り当てて採点する。
 * 割当は時刻順の貪欲法: 各タップは未割当ターゲットのうち正規化距離
 * (|Δt| / expectedIOI) 最小のものを取り、窓 (matchR) 外なら余剰打点。
 * 分母は各打点の局所期待間隔 (8分なら IBI/2, A1-6)。
 */
export function scorePatternAttempt(
  targets: PatternTargetLike[],
  tapTimesSec: number[],
  matchR = PATTERN_MATCH_R,
): PatternAttemptScore {
  const claimed: (number | null)[] = targets.map(() => null); // 割当タップ時刻
  const taps: PatternTapAssignment[] = [];
  for (const t of [...tapTimesSec].sort((a, b) => a - b)) {
    let best = -1;
    let bestNorm = Infinity;
    targets.forEach((tg, i) => {
      if (claimed[i] !== null) return;
      const norm = Math.abs(t - tg.timeSec) / tg.expectedIoiSec;
      if (norm < bestNorm) {
        bestNorm = norm;
        best = i;
      }
    });
    if (best >= 0 && bestNorm <= matchR) {
      claimed[best] = t;
      taps.push({ timeSec: t, matched: true, targetIndex: best, asyncSec: t - targets[best].timeSec });
    } else {
      taps.push({ timeSec: t, matched: false, targetIndex: null, asyncSec: null });
    }
  }
  const perTarget: PatternTargetScore[] = targets.map((tg, i) => {
    const tap = claimed[i];
    if (tap === null) return { asyncSec: null, r: null, grade: null, hit: false };
    const { r, grade } = scoreSync(tap - tg.timeSec, tg.expectedIoiSec);
    return { asyncSec: tap - tg.timeSec, r, grade, hit: grade !== 'none' };
  });
  const extraTaps = taps.filter((t) => !t.matched).length;
  const allTargetsHit = perTarget.length > 0 && perTarget.every((t) => t.hit);
  return { perTarget, taps, extraTaps, allTargetsHit, complete: allTargetsHit && extraTaps === 0 };
}
