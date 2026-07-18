// 全身レイヤー (requirements §6.2)。キャラが一定拍で手拍子し、子は身体で参加。
// 採点しない・失敗概念なし。16拍流し切り = 完了。

import type { App, Screen } from '../app';
import { el } from '../dom';
import { getEngine } from '../../engine/audio';
import { storage } from '../../core/storage';

const TOTAL_BEATS = 16;

export function wholebodyScreen(app: App): Screen {
  const engine = getEngine();
  const child = storage.getActiveChild();
  let offBeat: (() => void) | null = null;

  const root = el('div', { class: 'screen' });
  const header = el(
    'div',
    { class: 'screen-header' },
    el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
    el('h1', { text: '🕺 からだ' }),
    el('div'),
  );
  const stage = el('div', { class: 'stage' });
  root.append(header, stage);

  function showIntro(): void {
    stage.replaceChildren(
      el('div', { class: 'buddy', text: '🐻' }),
      el('p', { class: 'kid-note', text: 'いっしょに てをたたこう！' }),
      el('button', {
        class: 'btn btn-big',
        text: '▶ はじめる',
        onPointerDown: () => void run(),
      }),
    );
  }

  async function run(): Promise<void> {
    const buddy = el('div', { class: 'buddy', text: '🐻' });
    const count = el('div', { class: 'beat-dots' });
    stage.replaceChildren(buddy, el('p', { class: 'kid-note', text: '👏 ぱちぱち！' }), count);

    // SMT較正済みならその付近、未較正は 500ms (120bpm)
    engine.setBpm(60000 / (child.smtMs ?? 500));
    let beats = 0;
    offBeat = engine.onBeat(() => {
      beats++;
      buddy.classList.remove('bounce');
      void buddy.offsetWidth; // アニメ再トリガ
      buddy.classList.add('bounce');
      count.textContent = '●'.repeat(beats) + '○'.repeat(Math.max(0, TOTAL_BEATS - beats));
      if (beats >= TOTAL_BEATS) {
        engine.stop();
        offBeat?.();
        storage.log('wholebody', { completed: true, beats });
        showDone();
      }
    });
    await engine.start();
  }

  function showDone(): void {
    stage.replaceChildren(
      el('div', { class: 'feedback-emoji', text: '🎉' }),
      el('p', { class: 'kid-note', text: 'できた！ すごい！' }),
      el('button', { class: 'btn btn-big', text: '🔁 もういちど', onPointerDown: () => void run() }),
      el('button', { class: 'btn btn-ghost', text: '🏠 おうちへ', onClick: () => app.go('home') }),
    );
  }

  showIntro();
  return {
    el: root,
    destroy: () => {
      engine.stop();
      offBeat?.();
    },
  };
}
