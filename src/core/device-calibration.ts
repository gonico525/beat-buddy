// デバイス較正 (requirements §5.1)。保護者が「音が鳴った瞬間に」タップ。
// 100bpm × 16拍、最初の2タップ破棄、生async (deviceOffset未適用) の中央値 →
// deviceOffsetMs。入力遅延+保護者の先取り傾向の合算だが系統ずれの中心化には十分。

import { median } from './scoring';

export const DEVICE_CAL_CONFIG = {
  bpm: 100, // IBI = 600ms
  totalBeats: 16,
  discardTaps: 2,
  minValidTaps: 8, // これ未満なら再測定を促す
} as const;

export interface DeviceCalResult {
  deviceOffsetMs: number | null;
  validTapCount: number;
}

export class DeviceCalCollector {
  private rawAsyncsSec: number[] = [];

  /** エンジンの onTap から生 async (deviceOffset=0 で測ったもの) を渡す。 */
  addRawAsync(asyncSec: number): void {
    this.rawAsyncsSec.push(asyncSec);
  }

  result(): DeviceCalResult {
    const valid = this.rawAsyncsSec.slice(DEVICE_CAL_CONFIG.discardTaps);
    if (valid.length < DEVICE_CAL_CONFIG.minValidTaps) {
      return { deviceOffsetMs: null, validTapCount: valid.length };
    }
    return {
      deviceOffsetMs: median(valid) * 1000,
      validTapCount: valid.length,
    };
  }
}
