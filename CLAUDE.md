# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

beat-buddy is a web app that develops preschoolers' sense of rhythm in the order perception → synchronization → reproduction. It is a vanilla TypeScript + Vite app with **no framework, no server, no accounts, and no external assets** — all sound is Oscillator-synthesized, persistence is localStorage only, and it works offline.

The source of truth for behavior is `docs/requirements.md` (Japanese). Code comments cite it by section (e.g. `requirements §7`); when changing behavior, check the cited section first and keep the code consistent with it. Comments and docs are written in Japanese; child-facing UI text is hiragana.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc --noEmit (type check) + vite build → dist/
npm test           # vitest run (pure-function tests only)
npx vitest run tests/scoring.test.ts   # single test file
npx vitest run -t "テスト名"            # single test by name
```

There is no lint/format tooling; type checking (`tsc --noEmit`, strict mode with noUnusedLocals/noUnusedParameters) is the gate.

Deployment: push to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages. The app is served from a subpath, so `base: '/beat-buddy/'` in `vite.config.ts` is required — don't remove it. There is no client-side routing (single-page screen swapping only), deliberately avoiding the GitHub Pages 404-fallback problem.

## Architecture

Three strictly ordered layers. Everything scoreable sits on top of the raw signed asynchrony the engine produces — the engine measures, `core` decides policy, `ui` displays.

### `src/engine/` — measurement core (framework-free TS)

- `rhythm-engine.ts`: the timing heart. Master clock is `AudioContext.currentTime` — never `Date.now`/`setTimeout` as a timing source. A two-clock scheduler (coarse `setInterval` decides *what*, AudioContext decides *when*) keeps audio sample-accurate regardless of JS jitter. It reconciles three coordinate systems: taps live in `performance.now()` ms (bridged via `getOutputTimestamp()`, with a start-time offset fallback), beats live in AudioContext seconds, and the child *hears* beats `outputLatency` later (fallback: `baseLatency`). `deviceOffset` corrects input latency. `onTap` distributes raw asynchrony only — no pass/fail judgment here; scoring and the debug display attach to the same stream in parallel.
- `pattern-player.ts`: short-pattern playback (echo/perception modes), same AudioContext, schedules all onsets at once.
- `audio.ts`: singletons for the shared AudioContext and engine. `AudioContext.resume()` must happen inside a user gesture (iOS Safari), which is why `RhythmEngine.start()` is called from tap handlers.

### `src/core/` — pure policy layer (no side effects, no DOM/audio)

- `scoring.ts`: pure scoring functions. Sync grading uses relative error `r = |async| / IBI` (auto-scales to tempo): `r ≤ 0.15` perfect, `≤ 0.30` good, otherwise `none`. Echo requires onset-count match and every IOI relative error ≤ 0.30. Also `median` and `coefficientOfVariation` stats.
- `smt.ts` / `device-calibration.ts`: the two calibrations are **different things**. Device calibration (parent, once per device): 100 bpm × 16 beats, discard first 2 taps, median raw async → `deviceOffsetMs`. SMT calibration (per child): free tapping, max 12 taps or 8 s, discard first tap, 120 ms debounce, median ITI clamped to 300–700 ms, converged when CV of last 5 ITIs < 0.20.
- `storage.ts`: all localStorage access (keys prefixed `beatbuddy:`). Child profiles, device offset, feature unlocks, and a capped single-session log (reset on every app start in `main.ts`). Reads/writes never throw — storage failure degrades silently.

### `src/ui/` — screens (vanilla TS + DOM)

- `app.ts`: minimal screen registry/switcher; screens are factories returning `{ el, destroy? }`. Always clean up (stop engine, clear timers) in `destroy`.
- `dom.ts`: `el()` helper. Child-facing UI uses `pointerdown`, not `click` (requirements §11) — pass `event.timeStamp` straight to `engine.handleTap()`.
- `screens/`: home / perception / wholebody / sync / echo / settings / debug.
- `parent-gate.ts`: 2-second long-press + one arithmetic question guarding parent-only actions.

## Domain rules that constrain code changes

- **Sign convention** (used everywhere): asynchrony = tap time − audible beat time. **Negative = anticipation (early), positive = late.** Don't flip it.
- **Scoring is asymmetric and never punishes**: hits get positive feedback ("ぴったり"/"いいね"); misses produce *no reaction* — no penalty, no failure display, no demotion. Perception and wholebody layers are not scored at all.
- **Feature unlocking is parent-judgment only**: no automatic promotion or demotion, ever — not performance-based, not time-based. Locked items stay visible (disabled, not hidden). Unlock/relock operations must go through the parent gate. `FEATURE_LADDER` in `storage.ts` is a recommended display order only, never an enforced sequence.
- **Explicit non-goals** (requirements §2): microphone-based detection, accounts/server/cloud sync, exact absolute input-latency measurement, and auto-unlocking. Don't add these.
- Tunable constants (scoring thresholds, calibration parameters, gate mechanics) come from requirements §12 and live as named exported constants (`SYNC_PERFECT_R`, `SMT_CONFIG`, `DEVICE_CAL_CONFIG`, …) — keep them centralized, not inlined.

## Tests

`tests/` covers the pure layer only (`scoring`, `smt`) with vitest — no DOM or audio mocking. Keep engine/UI logic thin enough that policy stays in `src/core/` where it's testable.
