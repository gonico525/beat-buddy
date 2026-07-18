// こだまレイヤー (requirements §6.4)。2〜3音の短パターンを真似して返す。
// 一致判定: (a) オンセット数一致 (b) 各IOI相対誤差 ≤ 0.30。外れは罰しない。
// 基本 = 2音・均等。発展 (親解禁) = 3音 / 長短 (1つ倍)。呼びかけ↔応答で親子主役。
// 1セッション = 最大 ECHO_MAX_ROUNDS 回の連続試行。⏹ でどのフェーズでも中断可。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getAudioContext, playTapSound } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { scoreEcho } from '../../core/scoring';
import { SMT_CONFIG } from '../../core/smt';
import { storage } from '../../core/storage';

const RESPONSE_TIMEOUT_MS = 8000;
const ECHO_MAX_ROUNDS = 10; // 1セッションの連続試行数上限 (§12)
const NEXT_ROUND_DELAY_MS = 1300;

export function echoScreen(app: App): Screen {
  const player = new PatternPlayer(getAudioContext());
  const child = storage.getActiveChild();
  const smtSec = (child.smtMs ?? 500) / 1000;
  const advanced = storage.isUnlocked(child, 'echoAdvanced');

  let handle: { cancel(): void } | null = null;
  let timer: number | null = null;
  let partner: 'parent-child' | 'solo' = 'parent-child';
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
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  // パターン生成: IOIはSMT帯。基本=2音均等。発展=3音均等 or 長短(1つ倍)。
  function makePattern(): number[] {
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
      el('div', { class: 'buddy', text: '🦜' }),
      el('p', {
        class: 'kid-note',
        text: partner === 'parent-child' ? 'よびかけに こたえよう！ まねっこタップ！' : 'おなじリズムで タップしてね！',
      }),
      el('button', { class: 'btn btn-big', text: '▶ はじめる', onPointerDown: () => void runTrial(1) }),
    );
  }

  async function runTrial(round: number): Promise<void> {
    cleanup();
    const mySession = session;
    await getAudioContext().resume(); // ユーザジェスチャ起点 (iOS Safari)
    if (session !== mySession) return;
    const targetIois = makePattern();
    const expectedOnsets = targetIois.length + 1;

    const buddy = el('div', { class: 'buddy', text: '🦜' });
    const note = el('p', { class: 'kid-note', text: 'きいてね…' });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro });
    stage.replaceChildren(roundDots(round), note, buddy, stopBtn);

    const h = player.play(targetIois, {
      freq: 880,
      onOnset: () => {
        buddy.classList.remove('bounce');
        void buddy.offsetWidth;
        buddy.classList.add('bounce');
      },
    });
    handle = h;
    await h.finished;
    if (session !== mySession) return;

    // 応答フェーズ
    const tapTimes: number[] = [];
    let finished = false;
    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    note.textContent = 'きみのばん！';
    stage.replaceChildren(roundDots(round), note, pad, stopBtn);

    const finish = () => {
      if (finished || session !== mySession) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
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
      timer = window.setTimeout(() => {
        if (round < ECHO_MAX_ROUNDS) void runTrial(round + 1);
        else showDone();
      }, NEXT_ROUND_DELAY_MS);
    };

    pad.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const last = tapTimes[tapTimes.length - 1];
      if (last !== undefined && e.timeStamp - last < SMT_CONFIG.debounceItiMs) return;
      playTapSound();
      tapTimes.push(e.timeStamp);
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
      if (tapTimes.length >= expectedOnsets) {
        // 期待数に達したら少し待って締める (余分タップはオンセット数不一致として拾う)
        if (timer !== null) clearTimeout(timer);
        timer = window.setTimeout(finish, 900);
      }
    });
    timer = window.setTimeout(finish, RESPONSE_TIMEOUT_MS);
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
