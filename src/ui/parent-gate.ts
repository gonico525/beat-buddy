// 親ゲート (requirements §8)。長押し2秒 + 一段階の算数確認。
// プレリーダーの幼児には解けず、親には容易。機構は §12 でチューニング可。

import { el } from './dom';

const HOLD_MS = 2000;

export function openParentGate(onSuccess: () => void): void {
  const overlay = el('div', { class: 'overlay' });
  const card = el('div', { class: 'card gate-card' });
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  function showHoldStep(): void {
    card.replaceChildren(
      el('h2', { text: 'おうちのひとへ' }),
      el('p', { class: 'gate-note', text: 'ボタンを2びょう ながおししてください' }),
    );
    const holdBtn = el('button', { class: 'btn gate-hold', text: 'ながおし' });
    const bar = el('div', { class: 'gate-bar' }, el('div', { class: 'gate-bar-fill' }));
    const fill = bar.firstElementChild as HTMLElement;
    let start = 0;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / HOLD_MS);
      fill.style.width = `${p * 100}%`;
      if (p >= 1) {
        showMathStep();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const cancel = () => {
      cancelAnimationFrame(raf);
      fill.style.width = '0%';
    };
    holdBtn.addEventListener('pointerdown', (e) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      start = performance.now();
      raf = requestAnimationFrame(tick);
    });
    holdBtn.addEventListener('pointerup', cancel);
    holdBtn.addEventListener('pointercancel', cancel);
    card.append(holdBtn, bar, el('button', { class: 'btn btn-ghost', text: 'やめる', onClick: close }));
  }

  function showMathStep(): void {
    const a = 2 + Math.floor(Math.random() * 8);
    const b = 2 + Math.floor(Math.random() * 8);
    const answer = a + b;
    const options = new Set<number>([answer]);
    while (options.size < 3) {
      const wrong = answer + (Math.floor(Math.random() * 7) - 3);
      if (wrong !== answer && wrong > 0) options.add(wrong);
    }
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    card.replaceChildren(
      el('h2', { text: 'かくにん' }),
      el('p', { class: 'gate-note', text: `${a} + ${b} = ?` }),
      el(
        'div',
        { class: 'gate-options' },
        ...shuffled.map((n) =>
          el('button', {
            class: 'btn',
            text: String(n),
            onClick: () => {
              if (n === answer) {
                close();
                onSuccess();
              } else {
                showMathStep(); // 失敗表示なしで問題を変えて継続
              }
            },
          }),
        ),
      ),
      el('button', { class: 'btn btn-ghost', text: 'やめる', onClick: close }),
    );
  }

  showHoldStep();
}
