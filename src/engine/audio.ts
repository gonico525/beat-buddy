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
