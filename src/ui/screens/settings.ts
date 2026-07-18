// 保護者用設定 (親ゲート通過後)。デバイス較正 / SMT較正 / 解禁トグル /
// プロフィール / デバッグ切替。解禁は親判断のみ・自動昇格降格なし (§8)。

import type { App, Screen } from '../app';
import { el } from '../dom';
import { getEngine, applyDeviceOffsetMs } from '../../engine/audio';
import { DeviceCalCollector, DEVICE_CAL_CONFIG } from '../../core/device-calibration';
import { SmtCollector, SMT_CONFIG } from '../../core/smt';
import { storage, FEATURE_LADDER } from '../../core/storage';

export function settingsScreen(app: App): Screen {
  const engine = getEngine();
  let offBeat: (() => void) | null = null;
  let offTap: (() => void) | null = null;
  let smtTimer: number | null = null;

  const cleanup = () => {
    engine.stop();
    offBeat?.();
    offTap?.();
    offBeat = offTap = null;
    if (smtTimer !== null) clearInterval(smtTimer);
    // デバイス較正中に離脱しても補正値が0のまま残らないよう、常に保存値へ戻す
    engine.deviceOffset = storage.getDevice().deviceOffsetMs / 1000;
  };

  const root = el('div', { class: 'screen parent-screen' });
  const header = el(
    'div',
    { class: 'screen-header' },
    el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
    el('h1', { text: '⚙️ 保護者設定' }),
    el('div'),
  );
  const stage = el('div', { class: 'stage stage-list' });
  root.append(header, stage);

  function showMain(): void {
    cleanup();
    const child = storage.getActiveChild();
    const device = storage.getDevice();

    const unlockSection = el('div', { class: 'card' }, el('h2', { text: '解禁 (親判断のみ・推奨順)' }));
    for (const item of FEATURE_LADDER) {
      const on = storage.isUnlocked(child, item.key);
      unlockSection.appendChild(
        el(
          'label',
          { class: 'toggle-row' },
          el('span', { text: item.label }),
          el('button', {
            class: `btn chip ${on ? 'chip-on' : ''}`,
            text: on ? '解禁中' : 'ロック中',
            onClick: () => {
              storage.setUnlocked(child, item.key, !on);
              showMain();
            },
          }),
        ),
      );
    }
    unlockSection.appendChild(
      el('p', { class: 'small-note', text: '※ 知覚・全身は常時開放。順序の強制はありません。' }),
    );

    const childSection = el(
      'div',
      { class: 'card' },
      el('h2', { text: 'こどもプロフィール' }),
      el('p', {
        class: 'small-note',
        text: `SMT: ${child.smtMs ? `${Math.round(child.smtMs)}ms (${Math.round(60000 / child.smtMs)}bpm)` : '未計測 (既定500ms)'}`,
      }),
      el('button', { class: 'btn', text: '🥁 SMT計測 (すきに叩いてね)', onClick: showSmtCal }),
      el('input', {
        class: 'name-input',
        attrs: { type: 'text', placeholder: 'なまえ (任意・ローカルのみ)', value: child.name ?? '' },
      }),
      el('button', {
        class: 'btn btn-ghost',
        text: '名前を保存',
        onClick: () => {
          const input = childSection.querySelector('input') as HTMLInputElement;
          child.name = input.value.trim() || undefined;
          storage.saveChild(child);
          showMain();
        },
      }),
    );

    const deviceSection = el(
      'div',
      { class: 'card' },
      el('h2', { text: 'デバイス較正' }),
      el('p', {
        class: 'small-note',
        text: `deviceOffset: ${Math.round(device.deviceOffsetMs)}ms (端末ごとに1回・再実行可)`,
      }),
      el('button', { class: 'btn', text: '🎧 較正する (音に合わせてタップ)', onClick: () => void showDeviceCal() }),
    );

    const debugSection = el(
      'div',
      { class: 'card' },
      el('h2', { text: '検証' }),
      el('button', {
        class: `btn chip ${storage.getDebugMode() ? 'chip-on' : ''}`,
        text: storage.getDebugMode() ? 'デバッグモード ON' : 'デバッグモード OFF',
        onClick: () => {
          storage.setDebugMode(!storage.getDebugMode());
          showMain();
        },
      }),
      el('button', { class: 'btn btn-ghost', text: '📊 ログを見る', onClick: () => app.go('debug') }),
    );

    stage.replaceChildren(unlockSection, childSection, deviceSection, debugSection);
  }

  // --- デバイス較正 (§5.1): 100bpm×16拍、先頭2タップ破棄、生asyncの中央値 ---
  async function showDeviceCal(): Promise<void> {
    cleanup();
    const collector = new DeviceCalCollector();
    const savedOffset = engine.deviceOffset;
    engine.deviceOffset = 0; // 生asyncを測るため一時的に補正を切る

    const note = el('p', { class: 'kid-note', text: '音が鳴った瞬間にタップしてください' });
    const pad = el('button', { class: 'tap-pad', text: '🎧' });
    const progress = el('p', { class: 'small-note', text: '' });
    stage.replaceChildren(
      note,
      pad,
      progress,
      el('button', {
        class: 'btn btn-ghost',
        text: 'やめる',
        onClick: () => {
          engine.deviceOffset = savedOffset;
          showMain();
        },
      }),
    );

    let beats = 0;
    engine.setBpm(DEVICE_CAL_CONFIG.bpm);
    offTap = engine.onTap((tap) => collector.addRawAsync(tap.asynchrony));
    offBeat = engine.onBeat(() => {
      beats++;
      progress.textContent = `${beats} / ${DEVICE_CAL_CONFIG.totalBeats} 拍`;
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
      if (beats >= DEVICE_CAL_CONFIG.totalBeats) {
        // 最終拍のタップを取りこぼさないよう少し待って締める
        setTimeout(() => {
          cleanup();
          const result = collector.result();
          if (result.deviceOffsetMs === null) {
            engine.deviceOffset = savedOffset;
            note.textContent = `タップが足りませんでした (有効${result.validTapCount})。もう一度どうぞ。`;
            stage.append(el('button', { class: 'btn', text: '🔁 再測定', onClick: () => void showDeviceCal() }));
          } else {
            applyDeviceOffsetMs(result.deviceOffsetMs);
            note.textContent = `完了: deviceOffset = ${Math.round(result.deviceOffsetMs)}ms`;
            stage.append(el('button', { class: 'btn', text: 'OK', onClick: showMain }));
          }
        }, 700);
      }
    });
    pad.addEventListener('pointerdown', (e) => engine.handleTap(e.timeStamp));
    await engine.start();
  }

  // --- SMT較正 (§5.2): 「すきに叩いてね」自由タップ ---
  function showSmtCal(): void {
    cleanup();
    const child = storage.getActiveChild();
    const collector = new SmtCollector();

    const note = el('p', { class: 'kid-note', text: 'すきに たたいてね！' });
    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    const progress = el('p', { class: 'small-note', text: '' });
    stage.replaceChildren(note, pad, progress, el('button', { class: 'btn btn-ghost', text: 'やめる', onClick: showMain }));

    let finished = false;
    const finish = () => {
      if (finished) return; // 終了後の追加タップで二重実行しない
      finished = true;
      cleanup();
      const result = collector.result();
      if (result.smtMs === null || !result.inRange) {
        note.textContent = result.smtMs === null
          ? 'タップが足りませんでした。もう一度どうぞ。'
          : `範囲外でした (${Math.round(result.smtMs)}ms / 妥当域 ${SMT_CONFIG.clampMinMs}–${SMT_CONFIG.clampMaxMs}ms)。再測定してください。`;
        stage.append(el('button', { class: 'btn', text: '🔁 再測定', onClick: showSmtCal }));
        return;
      }
      child.smtMs = result.smtMs;
      storage.saveChild(child);
      storage.log('smt', { smtMs: Math.round(result.smtMs), itisMs: result.itisMs.map(Math.round), converged: result.converged });
      note.textContent = `SMT = ${Math.round(result.smtMs)}ms (${Math.round(60000 / result.smtMs)}bpm)${result.converged ? ' ✓収束' : ''}`;
      stage.append(el('button', { class: 'btn', text: 'OK', onClick: showMain }));
    };

    pad.addEventListener('pointerdown', (e) => {
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
      progress.textContent = '●'.repeat(collector.tapCount + 1);
      if (collector.addTap(e.timeStamp)) finish();
    });
    smtTimer = window.setInterval(() => {
      if (collector.timedOut(performance.now())) finish();
    }, 250);
  }

  showMain();
  return { el: root, destroy: cleanup };
}
