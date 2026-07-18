// こだまレイヤー (requirements §6.4, addendum A1)。呼びかけ↔応答で真似して返す。
// ふつう: 2〜3音の短パターン。判定 (a) オンセット数一致 (b) 各IOI相対誤差 ≤ 0.30。
// リズム型 (A1-9): 4マスのビートグリッド (hit/rest/split) を1小節鳴らし、続く
// 無音の応答小節で子が同じ型を叩く (小節の枠が末尾休符の終端を定義する, A1-0)。
// タップはエンジンが最近傍ターゲット打点と照合し (A1-2)、採点分母は局所IOI
// (8分は IBI/2, A1-6)。休符位置の打点は記録のみで罰しない。外れも罰しない。
// 1セッション = 最大 ECHO_MAX_ROUNDS 回の連続試行。⏹ でどのフェーズでも中断可。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getAudioContext, getEngine, playTapSound } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { scoreEcho, scoreSync } from '../../core/scoring';
import {
  PATTERN_GROUPS,
  PATTERN_MATCH_R,
  patternIbiSec,
  patternsInGroup,
  scorePatternAttempt,
  type GridCell,
  type PatternGroupKey,
} from '../../core/patterns';
import { SMT_CONFIG } from '../../core/smt';
import { storage } from '../../core/storage';

const RESPONSE_TIMEOUT_MS = 8000;
const ECHO_MAX_ROUNDS = 10; // 1セッションの連続試行数上限 (§12)
const NEXT_ROUND_DELAY_MS = 1300;
/** 応答小節の終端後、末尾付近のタップを拾うための余白 (IBI比)。 */
const PATTERN_TAIL_IBI = 0.6;

type EchoMode = 'basic' | PatternGroupKey;

export function echoScreen(app: App): Screen {
  const player = new PatternPlayer(getAudioContext());
  const engine = getEngine();
  const child = storage.getActiveChild();
  const smtSec = (child.smtMs ?? 500) / 1000;
  const advanced = storage.isUnlocked(child, 'echoAdvanced');

  let handle: { cancel(): void } | null = null;
  let patternCancels: (() => void)[] = [];
  let timers: number[] = [];
  let partner: 'parent-child' | 'solo' = 'parent-child';
  let mode: EchoMode = 'basic';
  let session = 0; // 世代カウンタ。cleanup で進め、待機中の非同期継続を無効化する

  const root = el('div', { class: 'screen' });
  const header = el(
    'div',
    { class: 'screen-header' },
    el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
    el('h1', { text: '🦜 こだま' }),
    el('div'),
  );
  const stage = el('div', { class: 'stage' });
  root.append(header, stage);

  const cleanup = () => {
    session++;
    handle?.cancel();
    handle = null;
    patternCancels.forEach((c) => c());
    patternCancels = [];
    engine.clearPatternTargets();
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  };

  // ふつうモードのパターン生成: IOIはSMT帯。基本=2音均等。発展=3音均等 or 長短。
  function makeBasicPattern(): number[] {
    if (!advanced) return [smtSec];
    const variants: number[][] = [
      [smtSec], // 2音・均等
      [smtSec, smtSec], // 3音・均等
      [smtSec, smtSec * 2], // 3音・長短
      [smtSec * 2, smtSec], // 3音・短長
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function roundDots(round: number): HTMLElement {
    return el('p', {
      class: 'small-note',
      text: '●'.repeat(round) + '○'.repeat(ECHO_MAX_ROUNDS - round),
    });
  }

  function bump(node: HTMLElement, cls: string): void {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  // リズム型の選択チップ。ロック中も選択肢に見える形で残す (disabled, A1-8)。
  function modeChips(): HTMLElement {
    const chips: HTMLElement[] = [
      el('button', {
        class: `btn chip ${mode === 'basic' ? 'chip-on' : ''}`,
        text: 'ふつう',
        onPointerDown: () => {
          mode = 'basic';
          showIntro();
        },
      }),
    ];
    for (const g of PATTERN_GROUPS) {
      const locked = !storage.isUnlocked(child, g.key);
      chips.push(
        el('button', {
          class: `btn chip ${mode === g.key ? 'chip-on' : ''}`,
          text: locked ? `🔒 ${g.kidLabel}` : g.kidLabel,
          disabled: locked,
          onPointerDown: () => {
            if (locked) return;
            mode = g.key;
            showIntro();
          },
        }),
      );
    }
    return el('div', { class: 'chip-row wrap' }, ...chips);
  }

  function showIntro(): void {
    cleanup();
    const btnPair = el('button', { class: `btn chip ${partner === 'parent-child' ? 'chip-on' : ''}`, text: '👨‍👧 おやこ' });
    const btnSolo = el('button', { class: `btn chip ${partner === 'solo' ? 'chip-on' : ''}`, text: '🧒 ひとりで' });
    btnPair.addEventListener('pointerdown', () => {
      partner = 'parent-child';
      btnPair.classList.add('chip-on');
      btnSolo.classList.remove('chip-on');
    });
    btnSolo.addEventListener('pointerdown', () => {
      partner = 'solo';
      btnSolo.classList.add('chip-on');
      btnPair.classList.remove('chip-on');
    });
    stage.replaceChildren(
      el('div', { class: 'chip-row' }, btnPair, btnSolo),
      modeChips(),
      el('div', { class: 'buddy', text: '🦜' }),
      el('p', {
        class: 'kid-note',
        text:
          mode === 'basic'
            ? partner === 'parent-child'
              ? 'よびかけに こたえよう！ まねっこタップ！'
              : 'おなじリズムで タップしてね！'
            : 'きいたら つづけて おなじリズムで こたえてね！',
      }),
      el('button', { class: 'btn btn-big', text: '▶ はじめる', onPointerDown: () => void runTrial(1) }),
    );
  }

  function runTrial(round: number): Promise<void> {
    return mode === 'basic' ? runBasicTrial(round) : runPatternTrial(round, mode);
  }

  function scheduleNextRound(round: number): void {
    timers.push(
      window.setTimeout(() => {
        if (round < ECHO_MAX_ROUNDS) void runTrial(round + 1);
        else showDone();
      }, NEXT_ROUND_DELAY_MS),
    );
  }

  async function runBasicTrial(round: number): Promise<void> {
    cleanup();
    const mySession = session;
    await getAudioContext().resume(); // ユーザジェスチャ起点 (iOS Safari)
    if (session !== mySession) return;
    const targetIois = makeBasicPattern();
    const expectedOnsets = targetIois.length + 1;

    const buddy = el('div', { class: 'buddy', text: '🦜' });
    const note = el('p', { class: 'kid-note', text: 'きいてね…' });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro });
    stage.replaceChildren(roundDots(round), note, buddy, stopBtn);

    const h = player.play(targetIois, {
      freq: 880,
      onOnset: () => bump(buddy, 'bounce'),
    });
    handle = h;
    await h.finished;
    if (session !== mySession) return;

    // 応答フェーズ
    const tapTimes: number[] = [];
    let finished = false;
    let closeTimer: number | null = null;
    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    note.textContent = 'きみのばん！';
    stage.replaceChildren(roundDots(round), note, pad, stopBtn);

    const finish = () => {
      if (finished || session !== mySession) return;
      finished = true;
      const responseIois: number[] = [];
      for (let i = 1; i < tapTimes.length; i++) {
        responseIois.push((tapTimes[i] - tapTimes[i - 1]) / 1000);
      }
      const score = scoreEcho(targetIois, responseIois);
      storage.log('echo', {
        round,
        targetIoisMs: targetIois.map((s) => Math.round(s * 1000)),
        responseIoisMs: responseIois.map((s) => Math.round(s * 1000)),
        onsetCountMatch: score.onsetCountMatch,
        ioiErrors: score.ioiErrors.map((e) => Number(e.toFixed(3))),
        ok: score.ok,
        partner,
      });
      if (score.ok) {
        player.ding();
        flashFeedback(stage, '🌟✨', 'こだま ぴったり！', true);
      } else {
        // 罰しない: 中立のねぎらいのみ
        flashFeedback(stage, '🦜', 'きこえたよ！ つぎ いくよ！');
      }
      scheduleNextRound(round);
    };

    pad.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const last = tapTimes[tapTimes.length - 1];
      if (last !== undefined && e.timeStamp - last < SMT_CONFIG.debounceItiMs) return;
      playTapSound();
      tapTimes.push(e.timeStamp);
      bump(pad, 'pulse');
      if (tapTimes.length >= expectedOnsets) {
        // 期待数に達したら少し待って締める (余分タップはオンセット数不一致として拾う)
        if (closeTimer !== null) clearTimeout(closeTimer);
        closeTimer = window.setTimeout(finish, 900);
        timers.push(closeTimer);
      }
    });
    timers.push(window.setTimeout(finish, RESPONSE_TIMEOUT_MS));
  }

  // --- リズム型 (A1): 呼びかけ小節 (可聴) → 応答小節 (無音・ターゲットのみ) ---

  /** 4マスのグリッド表示。休符も「感じるマス」として見せ、鳴らないマスにも
   *  パルスの手がかりを点滅で出す (A1-5)。小節頭マスは枠で強調。 */
  function gridView(cells: GridCell[]) {
    const dots = new Map<string, HTMLElement>();
    const rowEl = el('div', { class: 'grid-row' });
    cells.forEach((cell, gi) => {
      const cellEl = el('div', { class: `grid-cell ${gi === 0 ? 'grid-head' : ''}` });
      if (cell === 'split') {
        for (const sub of [0, 1]) {
          const d = el('div', { class: 'gdot gdot-small' });
          dots.set(`${gi}-${sub}`, d);
          cellEl.appendChild(d);
        }
      } else {
        const d = el('div', { class: `gdot ${cell === 'rest' ? 'gdot-rest' : ''}` });
        dots.set(`${gi}-0`, d);
        cellEl.appendChild(d);
      }
      rowEl.appendChild(cellEl);
    });
    return {
      root: rowEl,
      flash(gridIndex: number, subIndex: number): void {
        const d = dots.get(`${gridIndex}-${subIndex}`);
        if (d) bump(d, 'on');
      },
    };
  }

  async function runPatternTrial(round: number, group: PatternGroupKey): Promise<void> {
    cleanup();
    const mySession = session;
    const ctx = getAudioContext();
    await ctx.resume(); // ユーザジェスチャ起点 (iOS Safari)
    if (session !== mySession) return;

    const pool = patternsInGroup(group);
    const def = pool[Math.floor(Math.random() * pool.length)];
    // テンポ規則 (A1-4): 4分のみ=SMT / 細分あり=SMT×1.6。型の練習中は固定。
    const ibi = patternIbiSec(def.cells, smtSec);

    const buddy = el('div', { class: 'buddy', text: '🦜' });
    const note = el('p', { class: 'kid-note', text: 'きいてね…' });
    const label = el('p', { class: 'small-note', text: def.label });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro });
    const grid = gridView(def.cells);
    stage.replaceChildren(roundDots(round), note, grid.root, buddy, label, stopBtn);

    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    let responding = false;
    let lastTapPerf = -Infinity;
    const tapContextTimes: number[] = [];

    const t0 = ctx.currentTime + 0.5;
    const call = engine.schedulePattern(def.cells, ibi, {
      startAt: t0,
      audible: true,
      onEvent: (e) => {
        if (session !== mySession) return;
        grid.flash(e.gridIndex, e.subIndex);
        if (e.sounding) bump(buddy, 'bounce');
      },
    });
    // 応答小節: 同じグリッドを続く小節に無音で置く。次の小節頭が終端を定義
    // するので末尾休符も計測できる (A1-0)。視覚パルスは継続提示 (A1-5)。
    const resp = engine.schedulePattern(def.cells, ibi, {
      startAt: call.barEndContext,
      audible: false,
      onEvent: (e) => {
        if (session !== mySession) return;
        grid.flash(e.gridIndex, e.subIndex);
        if (e.subIndex === 0 && pad.isConnected) bump(pad, 'pulse');
      },
    });
    engine.armPatternTargets(resp.targets, PATTERN_MATCH_R);
    patternCancels.push(call.cancel, resp.cancel);

    pad.addEventListener('pointerdown', (e) => {
      if (!responding) return;
      if (e.timeStamp - lastTapPerf < SMT_CONFIG.debounceItiMs) return;
      lastTapPerf = e.timeStamp;
      playTapSound();
      const res = engine.handlePatternTap(e.timeStamp);
      if (!res) return;
      tapContextTimes.push(res.tapContextTime);
      if (res.matched) {
        const { grade } = scoreSync(res.asynchrony, res.target.expectedIOI);
        if (grade === 'perfect') flashFeedback(stage, '✨', 'ぴったり！');
        else if (grade === 'good') flashFeedback(stage, '😊', 'いいね！');
      }
      // 外れ・休符位置・余剰は反応なし: 記録のみで罰しない (A1-6)
    });

    // 応答小節頭の少し前にパッドへ切り替える (子が構えられるように)
    const switchMs = Math.max(0, (call.barEndAudible - ctx.currentTime) * 1000 - 300);
    timers.push(
      window.setTimeout(() => {
        if (session !== mySession) return;
        responding = true;
        note.textContent = 'きみのばん！';
        stage.replaceChildren(roundDots(round), note, grid.root, pad, label, stopBtn);
      }, switchMs),
    );

    // 応答小節の終端 + 余白で締めて採点
    const finishMs = Math.max(0, (resp.barEndAudible + PATTERN_TAIL_IBI * ibi - ctx.currentTime) * 1000);
    timers.push(
      window.setTimeout(() => {
        if (session !== mySession) return;
        responding = false;
        engine.clearPatternTargets();
        const score = scorePatternAttempt(
          resp.targets.map((t) => ({ timeSec: t.audibleTime, expectedIoiSec: t.expectedIOI })),
          tapContextTimes,
        );
        storage.log('patternEcho', {
          round,
          gridId: def.id,
          group,
          ibiMs: Math.round(ibi * 1000),
          targetAsyncsMs: score.perTarget.map((t) =>
            t.asyncSec === null ? null : Math.round(t.asyncSec * 1000),
          ),
          grades: score.perTarget.map((t) => t.grade),
          extraTaps: score.extraTaps,
          allTargetsHit: score.allTargetsHit,
          complete: score.complete,
          partner,
        });
        if (score.complete) {
          player.ding();
          flashFeedback(stage, '🌟✨', 'こだま ぴったり！', true);
        } else if (score.allTargetsHit) {
          // 余剰打点は達成の上乗せに使うだけで罰しない (A1-6b)
          flashFeedback(stage, '✨', 'いいね！');
        } else {
          flashFeedback(stage, '🦜', 'きこえたよ！ つぎ いくよ！');
        }
        scheduleNextRound(round);
      }, finishMs),
    );
  }

  function showDone(): void {
    stage.replaceChildren(
      el('div', { class: 'buddy', text: '🦜' }),
      el('p', { class: 'kid-note', text: 'ぜんぶ できたね！ すごい！' }),
      el('button', { class: 'btn btn-big', text: '🔁 もういっかい', onPointerDown: () => void runTrial(1) }),
      el('button', { class: 'btn btn-ghost', text: '🏠 おうちへ', onClick: () => app.go('home') }),
    );
  }

  showIntro();
  return { el: root, destroy: cleanup };
}
