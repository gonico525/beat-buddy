// こだまレイヤー (requirements §6.4)。2〜3音の短パターンを真似して返す。
// 一致判定: (a) オンセット数一致 (b) 各IOI相対誤差 ≤ 0.30。外れは罰しない。
// 基本 = 2音・均等。発展 (親解禁) = 3音 / 長短 (1つ倍)。呼びかけ↔応答で親子主役。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getAudioContext } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { scoreEcho } from '../../core/scoring';
import { SMT_CONFIG } from '../../core/smt';
import { storage } from '../../core/storage';

const RESPONSE_TIMEOUT_MS = 8000;

export function echoScreen(app: App): Screen {
  const player = new PatternPlayer(getAudioContext());
  const child = storage.getActiveChild();
  const smtSec = (child.smtMs ?? 500) / 1000;
  const advanced = storage.isUnlocked(child, 'echoAdvanced');

  let handle: { cancel(): void } | null = null;
  let timer: number | null = null;
  let partner: 'parent-child' | 'solo' = 'parent-child';

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
    handle?.cancel();
    if (timer !== null) clearTimeout(timer);
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
      el('button', { class: 'btn btn-big', text: '▶ はじめる', onPointerDown: () => void runTrial() }),
    );
  }

  async function runTrial(): Promise<void> {
    cleanup();
    await getAudioContext().resume(); // ユーザジェスチャ起点 (iOS Safari)
    const targetIois = makePattern();
    const expectedOnsets = targetIois.length + 1;

    const buddy = el('div', { class: 'buddy', text: '🦜' });
    const note = el('p', { class: 'kid-note', text: 'きいてね…' });
    stage.replaceChildren(note, buddy);

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

    // 応答フェーズ
    const tapTimes: number[] = [];
    let finished = false;
    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    note.textContent = 'きみのばん！';
    stage.replaceChildren(note, pad, el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro }));

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
      const responseIois: number[] = [];
      for (let i = 1; i < tapTimes.length; i++) {
        responseIois.push((tapTimes[i] - tapTimes[i - 1]) / 1000);
      }
      const score = scoreEcho(targetIois, responseIois);
      storage.log('echo', {
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
        flashFeedback(stage, '🦜', 'きこえたよ！ もういっかい？');
      }
      setTimeout(showNext, 1300);
    };

    pad.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const last = tapTimes[tapTimes.length - 1];
      if (last !== undefined && e.timeStamp - last < SMT_CONFIG.debounceItiMs) return;
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

  function showNext(): void {
    stage.replaceChildren(
      el('div', { class: 'buddy', text: '🦜' }),
      el('button', { class: 'btn btn-big', text: '🔁 もういっかい', onPointerDown: () => void runTrial() }),
      el('button', { class: 'btn btn-ghost', text: '🏠 おうちへ', onClick: () => app.go('home') }),
    );
  }

  showIntro();
  return { el: root, destroy: cleanup };
}
