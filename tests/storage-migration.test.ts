// 解禁キーの読み替え (addendum A3-4)。旧6グループ (A1-8) で保存された
// プロフィールが新2レベル (A3-1) に引き継がれることを検証する。純関数のみ。

import { describe, expect, it } from 'vitest';
import { migrateFeatures, type FeatureKey } from '../src/core/storage';

describe('migrateFeatures (A3-4)', () => {
  it('旧 gap キーは pattern_quarter・旧 split キーは pattern_split に読み替える', () => {
    const legacy = ['pattern_gap_0', 'pattern_gap_3', 'pattern_split_2'] as unknown as FeatureKey[];
    expect(migrateFeatures(legacy)).toEqual(['pattern_quarter', 'pattern_split']);
  });

  it('現行キーはそのまま・重複は除去される', () => {
    const mixed = ['sync', 'echo', 'pattern_gap_1', 'pattern_quarter'] as unknown as FeatureKey[];
    expect(migrateFeatures(mixed)).toEqual(['sync', 'echo', 'pattern_quarter']);
  });

  it('未定義・空でも壊れない', () => {
    expect(migrateFeatures(undefined)).toEqual([]);
    expect(migrateFeatures([])).toEqual([]);
  });
});
