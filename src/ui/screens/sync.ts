// 同期レイヤー (requirements §6.3, §7)。SMT付近の一定拍に合わせてタップ。
// エンジンの生 async に採点純関数を適用。当たりは出す／外れは罰しない非対称。
// 発展 (親解禁): テンポ課題 (速める→保つ→遅らせる)、継続 (消音後に続けて叩く)。

import type { App, Screen } from '../app';
import { el, flashFeedback } from '../dom';
import { getEngine, getAudioContext, playTapSound } from '../../engine/audio';
import { PatternPlayer } from '../../engine/pattern-player';
import { scoreSync, median, driftRate, CONTINUATION_POSITIVE_DRIFT } from '../../core/scoring';
import { SMT_CONFIG } from '../../core/smt';
import { storage } from '../../core/storage';

interface TempoStage {
  key: string;
  label: string;
  mult: number; // bpm倍率 (>1 = 速い)
}

// 難易度順: 速める→保つ→遅らせる (減速が最も難しい)。SMT基準±%で段階化 (§12)。
const STAGES: TempoStage[] = [
  { key: 'base', label: 'ふつう', mult: 1 },
  { key: 'up10', label: 'はやく +10%', mult: 1.1 },
  { key: 'up20', label: 'はやく +20%', mult: 1.2 },
  { key: 'hold', label: 'ふつうに もどす', mult: 1 },
  { key: 'down10', label: 'ゆっくり −10%', mult: 0.9 },
  { key: 'down20', label: 'ゆっくり −20%', mult: 0.8 },
];

const CONTINUATION_GUIDE_BEATS = 8;
const CONTINUATION_MAX_TAPS = 8;
const CONTINUATION_MAX_MS = 6000;

export function syncScreen(app: App): Screen {
  const engine = getEngine();
  const player = new PatternPlayer(getAudioContext());
  const child = storage.getActiveChild();
  const smtMs = child.smtMs ?? 500;
  const tempoUnlocked = storage.isUnlocked(child, 'syncTempo');
  const continuationUnlocked = storage.isUnlocked(child, 'syncContinuation');

  let offBeat: (() => void) | null = null;
  let offTap: (() => void) | null = null;
  let streak = 0;
  let partner: 'parent-child' | 'solo' = 'parent-child';
  let stageIdx = 0;
  let contTimer: number | null = null;

  const root = el('div', { class: 'screen' });
  const header = el(
    'div',
    { class: 'screen-header' },
    el('button', { class: 'btn btn-ghost', text: '← もどる', onClick: () => app.go('home') }),
    el('h1', { text: '🥁 あわせる' }),
    el('div'),
  );
  const stage = el('div', { class: 'stage' });
  root.append(header, stage);

  const cleanup = () => {
    engine.stop();
    offBeat?.();
    offTap?.();
    offBeat = offTap = null;
    if (contTimer !== null) clearTimeout(contTimer);
  };

  function currentBpm(): number {
    return (60000 / smtMs) * STAGES[stageIdx].mult;
  }

  function partnerToggle(): HTMLElement {
    const btnPair = el('button', {
      class: `btn chip ${partner === 'parent-child' ? 'chip-on' : ''}`,
      text: '👨‍👧 おやこ',
    });
    const btnSolo = el('button', {
      class: `btn chip ${partner === 'solo' ? 'chip-on' : ''}`,
      text: '🧒 ひとりで',
    });
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
    return el('div', { class: 'chip-row' }, btnPair, btnSolo);
  }

  function showIntro(): void {
    cleanup();
    const items: HTMLElement[] = [
      partnerToggle(),
      el('p', {
        class: 'kid-note',
        text: partner === 'parent-child' ? 'おとに あわせて いっしょに タップ！' : 'おとに あわせて タップ！',
      }),
      el('button', { class: 'btn btn-big', text: '▶ はじめる', onPointerDown: () => void runSync() }),
    ];
    if (tempoUnlocked) {
      items.push(
        el('p', { class: 'small-note', text: 'テンポちょうせん (はやい→ふつう→ゆっくり のじゅんが おすすめ)' }),
        el(
          'div',
          { class: 'chip-row wrap' },
          ...STAGES.map((s, i) =>
            el('button', {
              class: `btn chip ${i === stageIdx ? 'chip-on' : ''}`,
              text: s.label,
              onPointerDown: () => {
                stageIdx = i;
                showIntro();
              },
            }),
          ),
        ),
      );
    }
    if (continuationUnlocked) {
      items.push(
        el('button', {
          class: 'btn',
          text: '🤫 つづけてタップ (おとが きえても つづける)',
          onPointerDown: () => void runContinuation(),
        }),
      );
    }
    stage.replaceChildren(...items);
  }

  async function runSync(): Promise<void> {
    cleanup();
    streak = 0;
    engine.setBpm(currentBpm());
    const ibi = 60 / currentBpm();

    const pad = el('button', { class: 'tap-pad', text: '🥁' });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro });
    stage.replaceChildren(
      el('p', { class: 'kid-note', text: STAGES[stageIdx].label }),
      pad,
      stopBtn,
    );

    offBeat = engine.onBeat(() => {
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
    });
    // 採点レイヤーは onTap ストリームに接続 (エンジンは良否判定しない)
    offTap = engine.onTap((tap) => {
      const { r, grade } = scoreSync(tap.asynchrony, ibi);
      storage.log('sync', {
        asyncMs: Math.round(tap.asynchrony * 1000),
        r: Number(r.toFixed(3)),
        grade,
        stage: STAGES[stageIdx].key,
        bpm: Math.round(currentBpm()),
        partner,
      });
      if (grade === 'perfect') {
        streak++;
        flashFeedback(stage, streak >= 3 ? '🌟✨' : '✨', 'ぴったり！', streak >= 3);
      } else if (grade === 'good') {
        streak++;
        flashFeedback(stage, '😊', 'いいね！');
      } else {
        streak = 0; // 反応なし: 失敗表示・減点なし
      }
    });
    pad.addEventListener('pointerdown', (e) => {
      playTapSound();
      engine.handleTap(e.timeStamp);
    });
    await engine.start();
  }

  // 継続課題: 数拍ガイド → 消音 → 子が続けて叩く。ドリフト率は記録のみ。
  async function runContinuation(): Promise<void> {
    cleanup();
    engine.setBpm(60000 / smtMs);
    const targetIbiMs = smtMs;

    const pad = el('button', { class: 'tap-pad', text: '👂' });
    const note = el('p', { class: 'kid-note', text: 'おとを きいてね…' });
    stage.replaceChildren(note, pad, el('button', { class: 'btn btn-ghost', text: '⏹ おわる', onClick: showIntro }));

    let guideBeats = 0;
    const tapTimes: number[] = [];
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (contTimer !== null) clearTimeout(contTimer);
      const itis: number[] = [];
      for (let i = 1; i < tapTimes.length; i++) {
        const iti = tapTimes[i] - tapTimes[i - 1];
        if (iti >= SMT_CONFIG.debounceItiMs) itis.push(iti);
      }
      if (itis.length >= 2) {
        const med = median(itis);
        const drift = driftRate(med / 1000, targetIbiMs / 1000);
        storage.log('continuation', {
          medianItiMs: Math.round(med),
          targetIbiMs,
          driftRate: Number(drift.toFixed(3)),
          taps: tapTimes.length,
          partner,
        });
        if (Math.abs(drift) <= CONTINUATION_POSITIVE_DRIFT) {
          player.ding();
          flashFeedback(stage, '🌟', 'そのちょうし！', true);
        } else {
          flashFeedback(stage, '🎵', 'きろくしたよ！');
        }
      } else {
        flashFeedback(stage, '🎵', 'また やってみよう！');
      }
      setTimeout(showIntro, 1200);
    };

    offBeat = engine.onBeat(() => {
      guideBeats++;
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
      if (guideBeats >= CONTINUATION_GUIDE_BEATS) {
        engine.stop(); // 消音。ここからは子のタップのみ
        note.textContent = '🤫 そのまま つづけて タップ！';
        pad.textContent = '🥁';
        contTimer = window.setTimeout(finish, CONTINUATION_MAX_MS);
      }
    });
    pad.addEventListener('pointerdown', (e) => {
      if (guideBeats < CONTINUATION_GUIDE_BEATS || finished) return;
      playTapSound();
      tapTimes.push(e.timeStamp);
      if (tapTimes.length >= CONTINUATION_MAX_TAPS) finish();
    });
    await engine.start();
  }

  showIntro();
  return { el: root, destroy: cleanup };
}
