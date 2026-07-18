// 知覚レイヤー (requirements §6.1)。規則/不規則の2択当てっこ。
// 採点しない扱い (低ステークス): 正解は⭐、不正解も失敗表示なし。1セッション4問。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getAudioContext } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { storage } from '../../core/storage';

const TRIALS = 4;
const ONSETS = 5;
const BASE_IOI = 0.5; // 一定拍側のIOI (秒)
const JITTER = 0.25; // 不規則側の位相摂動 (±IOI比)

function steadyIois(): number[] {
  return Array(ONSETS - 1).fill(BASE_IOI);
}

function irregularIois(): number[] {
  // 位相摂動: 各オンセットを±JITTER×IOI ずらす (テンポ摂動と等価な聞こえ方)
  const onsets = [0];
  for (let i = 1; i < ONSETS; i++) {
    onsets.push(i * BASE_IOI + (Math.random() * 2 - 1) * JITTER * BASE_IOI);
  }
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) iois.push(onsets[i] - onsets[i - 1]);
  return iois;
}

export function perceptionScreen(app: App): Screen {
  const player = new PatternPlayer(getAudioContext());
  let handle: { cancel(): void } | null = null;
  let trial = 0;
  let stars = 0;
  let busy = false;

  const root = el('div', { class: 'screen' });
  const header = el(
    'div',
    { class: 'screen-header' },
    el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
    el('h1', { text: '👂 きく' }),
    el('div', { class: 'star-row' }),
  );
  const starRow = header.querySelector('.star-row') as HTMLElement;
  const stage = el('div', { class: 'stage' });
  root.append(header, stage);

  const updateStars = () => {
    starRow.textContent = '⭐'.repeat(stars);
  };

  function showIntro(): void {
    stage.replaceChildren(
      el('p', { class: 'kid-note', text: 'きちんと ならんでる おとは どっち？' }),
      el('button', {
        class: 'btn btn-big',
        text: '▶ はじめる',
        onPointerDown: () => {
          void getAudioContext().resume();
          runTrial();
        },
      }),
    );
  }

  function runTrial(): void {
    if (trial >= TRIALS) {
      showResult();
      return;
    }
    trial++;
    const steadyIsA = Math.random() < 0.5;
    const a = steadyIsA ? steadyIois() : irregularIois();
    const b = steadyIsA ? irregularIois() : steadyIois();

    const btnA = el('button', { class: 'btn choice', text: '🐰', disabled: true });
    const btnB = el('button', { class: 'btn choice', text: '🐻', disabled: true });
    const prompt = el('p', { class: 'kid-note', text: 'きいてね…' });
    const replay = el('button', { class: 'btn btn-ghost', text: '🔁 もういちど', disabled: true });
    stage.replaceChildren(
      prompt,
      el('div', { class: 'choice-row' }, btnA, btnB),
      replay,
    );

    const playBoth = async () => {
      busy = true;
      btnA.disabled = btnB.disabled = replay.disabled = true;
      btnA.classList.add('playing');
      const ha = player.play(a, { freq: 880 });
      handle = ha;
      await ha.finished;
      btnA.classList.remove('playing');
      await new Promise((r) => setTimeout(r, 500));
      btnB.classList.add('playing');
      const hb = player.play(b, { freq: 660 });
      handle = hb;
      await hb.finished;
      btnB.classList.remove('playing');
      prompt.textContent = 'きちんとしてたのは どっち？';
      btnA.disabled = btnB.disabled = replay.disabled = false;
      busy = false;
    };

    const pick = (pickedSteady: boolean) => {
      if (busy) return;
      storage.log('perception', { trial, correct: pickedSteady });
      if (pickedSteady) {
        stars++;
        updateStars();
        player.ding();
        flashFeedback(stage, '⭐', 'あたり！', true);
      } else {
        flashFeedback(stage, '🎵', 'きいてくれて ありがとう！');
      }
      setTimeout(runTrial, 1100);
    };
    btnA.addEventListener('pointerdown', () => !btnA.disabled && pick(steadyIsA));
    btnB.addEventListener('pointerdown', () => !btnB.disabled && pick(!steadyIsA));
    replay.addEventListener('pointerdown', () => !busy && void playBoth());

    void playBoth();
  }

  function showResult(): void {
    stage.replaceChildren(
      el('div', { class: 'feedback-emoji', text: '🎉' }),
      el('p', { class: 'kid-note', text: `おしまい！ ${'⭐'.repeat(Math.max(stars, 1))}` }),
      el('button', { class: 'btn btn-big', text: '🏠 おうちへ', onClick: () => app.go('home') }),
    );
  }

  showIntro();
  updateStars();
  return { el: root, destroy: () => handle?.cancel() };
}
