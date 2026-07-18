// デバッグ画面 (requirements §11: async ヒストグラム / SMT収束の可視化)。
// sessionLog (直近1セッション) から描画。外部ライブラリなし・div バー描画。

import type { App, Screen } from '../app';
import { el } from '../dom';
import { coefficientOfVariation, median } from '../../core/scoring';
import { storage } from '../../core/storage';

const BIN_MS = 40;
const RANGE_MS = 400; // ±400ms を表示

export function debugScreen(app: App): Screen {
  const log = storage.getSessionLog();

  const root = el('div', { class: 'screen parent-screen' });
  root.append(
    el(
      'div',
      { class: 'screen-header' },
      el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
      el('h1', { text: '🔬 デバッグ' }),
      el('div'),
    ),
  );
  const stage = el('div', { class: 'stage stage-list' });
  root.append(stage);

  // --- async ヒストグラム (同期タップ) ---
  const asyncs = log
    .filter((e) => e.mode === 'sync')
    .map((e) => e.data.asyncMs as number)
    .filter((v) => typeof v === 'number');
  const histCard = el('div', { class: 'card' }, el('h2', { text: `同期 async ヒストグラム (n=${asyncs.length})` }));
  if (asyncs.length > 0) {
    const bins = new Map<number, number>();
    for (const a of asyncs) {
      const clamped = Math.max(-RANGE_MS, Math.min(RANGE_MS, a));
      const bin = Math.floor(clamped / BIN_MS) * BIN_MS;
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
    const maxCount = Math.max(...bins.values());
    const chart = el('div', { class: 'hist' });
    for (let b = -RANGE_MS; b < RANGE_MS; b += BIN_MS) {
      const count = bins.get(b) ?? 0;
      const bar = el('div', {
        class: `hist-bar ${b < 0 ? 'hist-early' : 'hist-late'}`,
        title: `${b}〜${b + BIN_MS}ms: ${count}`,
      });
      bar.style.height = `${(count / maxCount) * 100}%`;
      chart.appendChild(bar);
    }
    histCard.append(
      chart,
      el('p', { class: 'small-note', text: `中央値 ${Math.round(median(asyncs))}ms (負=先取り/正=遅れ) | 左半分=先取り` }),
    );
  } else {
    histCard.append(el('p', { class: 'small-note', text: 'まだ同期タップの記録がありません。' }));
  }

  // --- SMT収束 (ITI系列とCV) ---
  const smtEntries = log.filter((e) => e.mode === 'smt');
  const smtCard = el('div', { class: 'card' }, el('h2', { text: 'SMT収束' }));
  const last = smtEntries[smtEntries.length - 1];
  if (last) {
    const itis = (last.data.itisMs as number[]) ?? [];
    const chart = el('div', { class: 'hist' });
    const maxIti = Math.max(...itis, 1);
    for (const iti of itis) {
      const bar = el('div', { class: 'hist-bar hist-late', title: `${iti}ms` });
      bar.style.height = `${(iti / maxIti) * 100}%`;
      chart.appendChild(bar);
    }
    const recent5 = itis.slice(-5);
    smtCard.append(
      chart,
      el('p', {
        class: 'small-note',
        text: `ITI系列 (ms): ${itis.join(', ')} | 直近5 CV=${coefficientOfVariation(recent5).toFixed(3)} (閾値0.20) | 収束: ${last.data.converged ? '✓' : '×'}`,
      }),
    );
  } else {
    smtCard.append(el('p', { class: 'small-note', text: 'このセッションのSMT計測記録がありません。' }));
  }

  // --- 生ログ ---
  const rawCard = el(
    'div',
    { class: 'card' },
    el('h2', { text: `セッションログ (${log.length}件)` }),
    el('pre', { class: 'log-pre', text: log.slice(-50).map((e) => `${e.mode}: ${JSON.stringify(e.data)}`).join('\n') || '(空)' }),
  );

  stage.append(histCard, smtCard, rawCard);
  return { el: root };
}
