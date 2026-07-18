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
    // 九九の掛け算/割り算を数値入力で一問。選択式の当てずっぽうを防ぎ、
    // プレリーダーの幼児には解けない難度を保つ (§8, 機構は §12 でチューニング可)。
    const x = 3 + Math.floor(Math.random() * 7); // 3〜9
    const y = 3 + Math.floor(Math.random() * 7);
    const isDivision = Math.random() < 0.5;
    const question = isDivision ? `${x * y} ÷ ${y} = ?` : `${x} × ${y} = ?`;
    const answer = isDivision ? x : x * y;

    const input = el('input', {
      class: 'name-input gate-input',
      attrs: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' },
    });
    const submit = () => {
      const value = input.value.trim();
      if (value === '') return;
      if (Number(value) === answer) {
        close();
        onSuccess();
      } else {
        showMathStep(); // 失敗表示なしで問題を変えて継続
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    card.replaceChildren(
      el('h2', { text: 'かくにん' }),
      el('p', { class: 'gate-note', text: question }),
      input,
      el('button', { class: 'btn', text: 'こたえる', onClick: submit }),
      el('button', { class: 'btn btn-ghost', text: 'やめる', onClick: close }),
    );
    input.focus();
  }

  showHoldStep();
}
