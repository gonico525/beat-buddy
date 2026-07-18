# beat-buddy 🎵

幼児のリズム感を「知覚 → 同期 → 再現」の順に育てるウェブアプリ。
要件定義は [docs/requirements.md](docs/requirements.md) を参照。

## 特徴

- **測定コア** `src/engine/rhythm-engine.ts`: `AudioContext.currentTime` をマスタークロックとする two-clock スケジューラ。3座標系 (performance / AudioContext / 可聴時刻) を整合させ、符号付き生 asynchrony (負=先取り/正=遅れ) を配る。
- **採点は純方針レイヤー** (`src/core/scoring.ts`): 相対誤差 `r = |async| / IBI` で段階化。当たりは出す・外れは罰しない非対称。
- **4層**: 知覚(当てっこ) / 全身(手拍子) / 同期(合わせてタップ) / こだま(まねっこ)。
- **2種の較正**: デバイス較正 (deviceOffset) と SMT較正 (子の自発運動テンポ)。
- **解禁は親判断のみ**: 自動昇格・自動降格なし。親ゲート = 長押し2秒 + 算数一問。
- **永続化は localStorage のみ**: サーバ・アカウント・外部アセットなし。オフライン動作。

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm run build    # 型チェック + ビルド (dist/)
npm test         # 純関数のユニットテスト
```

## デプロイ

`main` への push で GitHub Actions が `dist/` を GitHub Pages に公開する
(`.github/workflows/deploy.yml`)。サブパス配信のため `vite.config.ts` に
`base: '/beat-buddy/'` を設定済み。

## ディレクトリ構成

```
docs/requirements.md      要件定義
src/engine/               測定コア (素TS・フレームワーク外)
  rhythm-engine.ts        two-clock スケジューラ + タップ計測
  pattern-player.ts       短パターン再生 (こだま・知覚用)
  audio.ts                共有 AudioContext / エンジンのシングルトン
src/core/                 純ロジック
  scoring.ts              採点純関数 (同期/こだま/継続) + 統計
  smt.ts                  SMT較正コレクタ
  device-calibration.ts   デバイス較正コレクタ
  storage.ts              localStorage 永続化
src/ui/                   画面 (素TS + DOM)
  screens/                home / perception / wholebody / sync / echo / settings / debug
  parent-gate.ts          親ゲート (長押し + 算数)
tests/                    純関数テスト (vitest)
```
