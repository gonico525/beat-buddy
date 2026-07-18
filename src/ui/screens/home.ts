// ホーム画面。4層 + 発展モードを一覧表示。ロック中も隠さず disabled 表示
// (requirements §8: 到達すべき梯子が親子に見えることを優先)。

import type { App, Screen } from '../app';
import { el } from '../dom';
import { storage } from '../../core/storage';
import { openParentGate } from '../parent-gate';

export function homeScreen(app: App): Screen {
  const child = storage.getActiveChild();

  const modeBtn = (
    emoji: string,
    label: string,
    screen: string,
    locked: boolean,
  ): HTMLElement => {
    const btn = el(
      'button',
      {
        class: `btn mode-btn ${locked ? 'locked' : ''}`,
        disabled: locked,
        onClick: () => !locked && app.go(screen),
      },
      el('span', { class: 'mode-emoji', text: locked ? '🔒' : emoji }),
      el('span', { class: 'mode-label', text: label }),
    );
    return btn;
  };

  const syncLocked = !storage.isUnlocked(child, 'sync');
  const echoLocked = !storage.isUnlocked(child, 'echo');

  const root = el(
    'div',
    { class: 'screen' },
    el(
      'div',
      { class: 'screen-header' },
      el('h1', { text: '🎵 beat-buddy' }),
      el('button', {
        class: 'btn btn-ghost',
        text: '⚙️',
        title: 'おうちのひと用せってい',
        onClick: () => openParentGate(() => app.go('settings')),
      }),
    ),
    el('p', { class: 'small-note', text: child.name ? `👤 ${child.name}` : '' }),
    el(
      'div',
      { class: 'mode-grid' },
      modeBtn('👂', 'きく', 'perception', false),
      modeBtn('🕺', 'からだ', 'wholebody', false),
      modeBtn('🥁', 'あわせる', 'sync', syncLocked),
      modeBtn('🦜', 'こだま', 'echo', echoLocked),
    ),
    storage.getDebugMode()
      ? el('button', { class: 'btn btn-ghost', text: '🔬 デバッグ', onClick: () => app.go('debug') })
      : el('div'),
  );

  return { el: root };
}
