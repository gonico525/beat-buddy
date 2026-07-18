// 共有 AudioContext とエンジンのシングルトン。
// AudioContext はユーザジェスチャ内で resume される前提 (iOS Safari 要件)。

import { RhythmEngine } from './rhythm-engine';
import { storage } from '../core/storage';

let ctx: AudioContext | null = null;
let engine: RhythmEngine | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function getEngine(): RhythmEngine {
  if (!engine) {
    engine = new RhythmEngine(getAudioContext());
    engine.deviceOffset = storage.getDevice().deviceOffsetMs / 1000;
  }
  return engine;
}

/** デバイス較正の保存後にエンジンへ反映する。 */
export function applyDeviceOffsetMs(ms: number): void {
  storage.setDeviceOffsetMs(ms);
  getEngine().deviceOffset = ms / 1000;
}

/** タップ確認音 (§11 音＋視覚の冗長提示)。拍(1000Hz)・パターン(880Hz)・
 *  ding(1320Hz) と聞き分けられるよう低め・短めの三角波。pointerdown ハンドラ
 *  から呼ぶ前提 (suspended でもジェスチャ内 resume で発音される)。 */
export function playTapSound(): void {
  const c = getAudioContext();
  if (c.state !== 'running') void c.resume();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 440;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}
