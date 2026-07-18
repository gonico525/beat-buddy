// こだまレイヤー (requirements §6.4, addendum A1/A2)。呼びかけ↔応答で真似して返す。
// ふつう: 2〜3音の短パターン。判定 (a) オンセット数一致 (b) 各IOI相対誤差 ≤ 0.30。
// リズム型 (A1-9, A2): 4マスのビートグリッド (hit/rest/split) を1小節鳴らして提示。
// 応答は音だけ — グリッド・オノマトペ・パルスは出さず (A2-1, A2-2)、子は好きな
// タイミングで叩き始める (A2-3)。採点は1打目基準の相対比 (scoreEchoShape, A2-4):
// テンポが目標と違っても形が合えば正解。打数違い・形違い・テンポ極端も罰しない。
// 末尾休符の型は終端が定義できず出題から除外 (A2-5)。
// 1セッション = 最大 ECHO_MAX_ROUNDS 回の連続試行。⏹ でどのフェーズでも中断可。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getAudioContext, getEngine, playTapSound } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { scoreEcho } from '../../core/scoring';
import {
  ECHO_PATTERN_GROUPS,
  echoPatternsInGroup,
  expandGrid,
  patternIbiSec,
  scoreEchoShape,
  type GridCell,
  type PatternGroupKey,
} from '../../core/patterns';
import { SMT_CONFIG } from '../../core/smt';
import { storage } from '../../core/storage';

const RESPONSE_TIMEOUT_MS = 8000;
const ECHO_MAX_ROUNDS = 10; // 1セッションの連続試行数上限 (§12)
const NEXT_ROUND_DELAY_MS = 1300;

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
    for (const g of ECHO_PATTERN_GROUPS) {
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
            : 'きいたら すきな ときに おなじリズムで こたえてね！',
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

  // --- リズム型 (A1 + A2): 呼びかけ小節 (可聴・表示あり) → 応答 (音だけ・任意開始) ---

  /** 4マスのグリッド表示 (出題フェーズ専用, A2-1)。休符も「感じるマス」として見せ、
   *  鳴らないマスにもパルスの手がかりを点滅で出す (A1-5)。小節頭マスは枠で強調。 */
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

    const pool = echoPatternsInGroup(group);
    const def = pool[Math.floor(Math.random() * pool.length)];
    // テンポ規則 (A1-4): 4分のみ=SMT / 細分あり=SMT×1.6。型の練習中は固定。
    const ibi = patternIbiSec(def.cells, smtSec);
    const { onsets } = expandGrid(def.cells, ibi);

    // 出題フェーズ (きいてね): 表示・発音は従来どおり (A2-6)
    const buddy = el('div', { class: 'buddy', text: '🦜' });
    const note = el('p', { class: 'kid-note', text: 'きいてね…' });
    const label = el('p', { class: 'small-note', text: def.label });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro });
    const grid = gridView(def.cells);
    stage.replaceChildren(roundDots(round), note, grid.root, buddy, label, stopBtn);

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
    patternCancels.push(call.cancel);

    // 応答フェーズ (A2-1〜A2-3): グリッド・オノマトペ・パルスは一切出さない。
    // 「きみのばん！」と太鼓のみ。子は好きなタイミングで叩き始め、採点は
    // 1打目基準の相対比 (A2-4) なので絶対時刻の基準もエンジン照合も不要。
    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    const tapTimes: number[] = []; // performance.now() ms。相対化するので基準は問わない
    let finished = false;
    let closeTimer: number | null = null;

    const finish = () => {
      if (finished || session !== mySession) return;
      finished = true;
      const score = scoreEchoShape(onsets, tapTimes.map((t) => t / 1000));
      storage.log('patternEcho', {
        round,
        gridId: def.id,
        group,
        ibiMs: Math.round(ibi * 1000),
        expectedOnsets: onsets.length,
        tapCount: tapTimes.length,
        onsetCountMatch: score.onsetCountMatch,
        scale: score.scale === null ? null : Number(score.scale.toFixed(3)),
        scaleValid: score.scaleValid,
        rs: score.perOnset.map((o) => Number(o.r.toFixed(3))),
        diffsMs: score.perOnset.map((o) => Math.round(o.diffSec * 1000)),
        grades: score.perOnset.map((o) => o.grade),
        ok: score.ok,
        partner,
      });
      if (score.ok && score.allPerfect) {
        player.ding();
        flashFeedback(stage, '🌟✨', 'こだま ぴったり！', true);
      } else if (score.ok) {
        flashFeedback(stage, '✨', 'いいね！');
      } else {
        // 罰しない: 打数違い・形違い・テンポ極端も記録のみで中立表示 (A2-4)
        flashFeedback(stage, '🦜', 'きこえたよ！ つぎ いくよ！');
      }
      scheduleNextRound(round);
    };

    pad.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const last = tapTimes[tapTimes.length - 1];
      if (last !== undefined && e.timeStamp - last < SMT_CONFIG.debounceItiMs) return;
      playTapSound(); // 自分の動作への反応のみ残す (A2-1)
      tapTimes.push(e.timeStamp);
      bump(pad, 'pulse');
      if (tapTimes.length >= onsets.length) {
        // 期待数に達したら少し待って締める (余分タップは打数不一致として拾う)
        if (closeTimer !== null) clearTimeout(closeTimer);
        closeTimer = window.setTimeout(finish, 900);
        timers.push(closeTimer);
      }
    });

    // 呼びかけ小節が鳴り終わったら応答表示へ (全型共通の見た目, A2-1)
    const switchMs = Math.max(0, (call.barEndAudible - ctx.currentTime) * 1000);
    timers.push(
      window.setTimeout(() => {
        if (session !== mySession) return;
        note.textContent = 'きみのばん！';
        stage.replaceChildren(roundDots(round), note, pad, stopBtn);
        timers.push(window.setTimeout(finish, RESPONSE_TIMEOUT_MS));
      }, switchMs),
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
