// リズム型・休符・細分 (docs/addendum-a1-rhythm-patterns.md,
// docs/addendum-a2-echo-response.md)。
// 4/4 固定・1小節=4マスのビートグリッド (A1-1)。純関数のみ・副作用なし。
// グリッドの展開 (expandGrid)・テンポ規則 (A1-4)・型全体の照合と採点
// (scorePatternAttempt, A1-6)・こだま応答の形採点 (scoreEchoShape, A2-4) を担う。
// エンジンは展開結果を実時刻に写すだけで、タイミング計測の作法は変えない (A1-2)。

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

// --- パターン集合と解禁レベル (A1-3, A3-1) ----------------------------------

/** 解禁レベル (A3-1)。旧6グループ (A1-8) を4分系/タタ系の2レベルに統合。 */
export type PatternGroupKey = 'pattern_quarter' | 'pattern_split';

export interface PatternDef {
  /** マス列を h/r/s で符号化した ID (例 'hhrh')。記録にも使う (A1-7)。 */
  id: string;
  group: PatternGroupKey;
  cells: GridCell[];
  /** 表示用オノマトペ (タ/タン/タタ/・)。楽譜記号は使わない (A1-10)。 */
  label: string;
}

/** 全31型。第1部・第2部前半は全網羅、第2部後半は「歌える型」の選定 (A1-3)、
 *  第3部は split 2つ・休符なしの全網羅 6型、第4部は split 複数+休符のうち
 *  こだまに出題可能な (末尾休符でない) 全網羅 9型 (A3-3)。 */
export const PATTERNS: PatternDef[] = [
  // 第1部: 4分のみ (1マス目固定・休符数で段階化・全網羅 8型)
  { id: 'hhhh', group: 'pattern_quarter', cells: ['hit', 'hit', 'hit', 'hit'], label: 'タタタタ' },
  { id: 'hhhr', group: 'pattern_quarter', cells: ['hit', 'hit', 'hit', 'rest'], label: 'タタタ・' },
  { id: 'hhrh', group: 'pattern_quarter', cells: ['hit', 'hit', 'rest', 'hit'], label: 'タタ・タ' },
  { id: 'hrhh', group: 'pattern_quarter', cells: ['hit', 'rest', 'hit', 'hit'], label: 'タ・タタ' },
  { id: 'hhrr', group: 'pattern_quarter', cells: ['hit', 'hit', 'rest', 'rest'], label: 'タタ・・' },
  { id: 'hrhr', group: 'pattern_quarter', cells: ['hit', 'rest', 'hit', 'rest'], label: 'タ・タ・' },
  { id: 'hrrh', group: 'pattern_quarter', cells: ['hit', 'rest', 'rest', 'hit'], label: 'タ・・タ' },
  { id: 'hrrr', group: 'pattern_quarter', cells: ['hit', 'rest', 'rest', 'rest'], label: 'タ・・・' },
  // 第2部: 8分の細分1つ (休符なし全網羅 4型 / 休符あり選定 4型)
  { id: 'shhh', group: 'pattern_split', cells: ['split', 'hit', 'hit', 'hit'], label: 'タタ タン タン タン' },
  { id: 'hshh', group: 'pattern_split', cells: ['hit', 'split', 'hit', 'hit'], label: 'タン タタ タン タン' },
  { id: 'hhsh', group: 'pattern_split', cells: ['hit', 'hit', 'split', 'hit'], label: 'タン タン タタ タン' },
  { id: 'hhhs', group: 'pattern_split', cells: ['hit', 'hit', 'hit', 'split'], label: 'タン タン タン タタ' },
  { id: 'shhr', group: 'pattern_split', cells: ['split', 'hit', 'hit', 'rest'], label: 'タタ タン タン ・' },
  { id: 'shrh', group: 'pattern_split', cells: ['split', 'hit', 'rest', 'hit'], label: 'タタ タン ・ タン' },
  { id: 'hshr', group: 'pattern_split', cells: ['hit', 'split', 'hit', 'rest'], label: 'タン タタ タン ・' },
  { id: 'hsrh', group: 'pattern_split', cells: ['hit', 'split', 'rest', 'hit'], label: 'タン タタ ・ タン' },
  // 第3部: 8分の細分2つ・休符なし (全網羅 6型, A3-3)
  { id: 'sshh', group: 'pattern_split', cells: ['split', 'split', 'hit', 'hit'], label: 'タタ タタ タン タン' },
  { id: 'shsh', group: 'pattern_split', cells: ['split', 'hit', 'split', 'hit'], label: 'タタ タン タタ タン' },
  { id: 'shhs', group: 'pattern_split', cells: ['split', 'hit', 'hit', 'split'], label: 'タタ タン タン タタ' },
  { id: 'hssh', group: 'pattern_split', cells: ['hit', 'split', 'split', 'hit'], label: 'タン タタ タタ タン' },
  { id: 'hshs', group: 'pattern_split', cells: ['hit', 'split', 'hit', 'split'], label: 'タン タタ タン タタ' },
  { id: 'hhss', group: 'pattern_split', cells: ['hit', 'hit', 'split', 'split'], label: 'タン タン タタ タタ' },
  // 第4部: split 複数 + 休符 (末尾休符 sshr shsr hssr ssrr srsr sssr は
  // こだまに出題不能 (A2-5) のため収録しない, A3-3)
  { id: 'ssrh', group: 'pattern_split', cells: ['split', 'split', 'rest', 'hit'], label: 'タタ タタ ・ タン' },
  { id: 'srsh', group: 'pattern_split', cells: ['split', 'rest', 'split', 'hit'], label: 'タタ ・ タタ タン' },
  { id: 'srhs', group: 'pattern_split', cells: ['split', 'rest', 'hit', 'split'], label: 'タタ ・ タン タタ' },
  { id: 'shrs', group: 'pattern_split', cells: ['split', 'hit', 'rest', 'split'], label: 'タタ タン ・ タタ' },
  { id: 'hsrs', group: 'pattern_split', cells: ['hit', 'split', 'rest', 'split'], label: 'タン タタ ・ タタ' },
  { id: 'hrss', group: 'pattern_split', cells: ['hit', 'rest', 'split', 'split'], label: 'タン ・ タタ タタ' },
  { id: 'srrs', group: 'pattern_split', cells: ['split', 'rest', 'rest', 'split'], label: 'タタ ・ ・ タタ' },
  { id: 'ssrs', group: 'pattern_split', cells: ['split', 'split', 'rest', 'split'], label: 'タタ タタ ・ タタ' },
  { id: 'srss', group: 'pattern_split', cells: ['split', 'rest', 'split', 'split'], label: 'タタ ・ タタ タタ' },
];

/** 解禁レベル (推奨表示順, A3-1)。hasRest は継続解禁の推奨表示に使う (A1-5)。 */
export const PATTERN_GROUPS: { key: PatternGroupKey; kidLabel: string; hasRest: boolean }[] = [
  { key: 'pattern_quarter', kidLabel: 'タン と おやすみ', hasRest: true },
  { key: 'pattern_split', kidLabel: 'タタ いり', hasRest: true },
];

export function patternsInGroup(key: PatternGroupKey): PatternDef[] {
  return PATTERNS.filter((p) => p.group === key);
}

// --- こだま層の出題プール (A2-5) --------------------------------------------

export function endsWithRest(cells: GridCell[]): boolean {
  return cells[cells.length - 1] === 'rest';
}

/** 末尾休符でも出題する例外 (A3-2)。打点2つの型は形採点 (A2-4) が1打目と
 *  最終打点で決まり、末尾休符の有無は測定に影響しない (タ・・タ と同じ条件)。 */
export const ECHO_TRAILING_REST_EXCEPTIONS: readonly string[] = ['hrhr'];

/** 末尾が休符の型は子の最終打点で終端が定義できず、相対評価 (A2-4) では
 *  測定不能。こだま層の出題プールから除外する (A2-5)。例外は A3-2 のみ。 */
export const ECHO_PATTERNS: PatternDef[] = PATTERNS.filter(
  (p) => !endsWithRest(p.cells) || ECHO_TRAILING_REST_EXCEPTIONS.includes(p.id),
);

export function echoPatternsInGroup(key: PatternGroupKey): PatternDef[] {
  return ECHO_PATTERNS.filter((p) => p.group === key);
}

/** 除外後に空になるレベルはこだまの選択肢にも出さない (A2-5)。
 *  現行の2レベル (A3-1) はいずれも非空。 */
export const ECHO_PATTERN_GROUPS = PATTERN_GROUPS.filter(
  (g) => echoPatternsInGroup(g.key).length > 0,
);

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

// --- こだま応答の形採点 (A2-4) ----------------------------------------------
// 絶対時刻の一致でなく「1打目基準の相対比」で照合する。開始タイミングは子ども
// 任意 (A2-3) で、テンポ (スケール s) が目標と違っても形が合えば正解。

/** スケール妥当域: 子テンポが目標の 0.5〜2.0 倍を外れたら無効扱い (記録のみ・罰しない)。 */
export const ECHO_SHAPE_SCALE_MIN = 0.5;
export const ECHO_SHAPE_SCALE_MAX = 2.0;

export interface EchoShapeOnset {
  /** 小節頭からの期待時刻 (目標テンポ秒)。expandGrid の onsets をそのまま渡せる。 */
  offsetSec: number;
  /** 局所期待間隔 (A1-6 踏襲: 8分は IBI/2)。分母は s 倍して子テンポに写す。 */
  expectedIoiSec: number;
}

export interface EchoShapeOnsetScore {
  /** 子テンポ秒での符号付きずれ d[i] − s·e[i] (負=先取り/正=遅れ、符号約束は共通)。 */
  diffSec: number;
  /** r[i] = |diff| / (s × 局所期待間隔)。段階は既存の r≤0.15/≤0.30 を流用。 */
  r: number;
  grade: SyncGrade;
}

export interface EchoShapeScore {
  /** false = 打点数が期待と違う =「形がちがった」。記録のみ・罰しない (A2-4)。 */
  onsetCountMatch: boolean;
  /** スパン比 s = d[n]/e[n] (子テンポ/目標)。打数不一致・スパン不成立は null。 */
  scale: number | null;
  /** s が妥当域 (0.5〜2.0倍) 内。外でも失敗表示はしない (記録のみ)。 */
  scaleValid: boolean;
  perOnset: EchoShapeOnsetScore[];
  allWithinGood: boolean;
  allPerfect: boolean;
  /** 打数一致 かつ s 妥当 かつ 全打点 r ≤ 0.30。非成立でも罰には使わない。 */
  ok: boolean;
}

/**
 * 期待打点列と子のタップ列を、1打目を 0 とした相対時刻で照合する (A2-4)。
 * s はスパン比 d[n]/e[n] の簡易推定。r[0] と r[n] は構成上 0 になる。
 */
export function scoreEchoShape(
  expected: EchoShapeOnset[],
  tapTimesSec: number[],
): EchoShapeScore {
  const onsetCountMatch = tapTimesSec.length === expected.length;
  const none: EchoShapeScore = {
    onsetCountMatch,
    scale: null,
    scaleValid: false,
    perOnset: [],
    allWithinGood: false,
    allPerfect: false,
    ok: false,
  };
  // 打点1つの型はスパンが定義できないが、末尾休符の除外 (A2-5, 例外 A3-2) 後の
  // こだまプールは常に2打点以上なので、実運用ではこの分岐に入らない。
  if (!onsetCountMatch || expected.length < 2) return none;
  const e0 = expected[0].offsetSec;
  const e = expected.map((x) => x.offsetSec - e0);
  const sorted = [...tapTimesSec].sort((a, b) => a - b);
  const d = sorted.map((t) => t - sorted[0]);
  const eSpan = e[e.length - 1];
  const dSpan = d[d.length - 1];
  if (eSpan <= 0 || dSpan <= 0) return none;
  const scale = dSpan / eSpan;
  const scaleValid = scale >= ECHO_SHAPE_SCALE_MIN && scale <= ECHO_SHAPE_SCALE_MAX;
  const perOnset: EchoShapeOnsetScore[] = expected.map((x, i) => {
    const diffSec = d[i] - scale * e[i];
    const { r, grade } = scoreSync(diffSec, scale * x.expectedIoiSec);
    return { diffSec, r, grade };
  });
  const allWithinGood = perOnset.every((o) => o.grade !== 'none');
  const allPerfect = perOnset.every((o) => o.grade === 'perfect');
  return {
    onsetCountMatch,
    scale,
    scaleValid,
    perOnset,
    allWithinGood,
    allPerfect,
    ok: scaleValid && allWithinGood,
  };
}
