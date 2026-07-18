# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

beat-buddy is a web app that develops preschoolers' sense of rhythm in the order perception → synchronization → reproduction. It is a vanilla TypeScript + Vite app with **no framework, no server, no accounts, and no external assets** — all sound is Oscillator-synthesized, persistence is localStorage only, and it works offline.

The source of truth for behavior is `docs/requirements.md` (Japanese), plus `docs/addendum-a1-rhythm-patterns.md` for the A1 rhythm-pattern increment (4/4 beat grids with hits/rests/splits), `docs/addendum-a2-echo-response.md` for the A2 echo-response change (sound-only response phase, child-timed start, shape scoring), and `docs/addendum-a3-echo-levels.md` for the A3 level restructure (two unlock levels instead of six groups, double-split patterns, no-immediate-repeat draws). Code comments cite them by section (e.g. `requirements §7`, `addendum A1-6`, `A2-4`); when changing behavior, check the cited section first and keep the code consistent with it. Comments and docs are written in Japanese; child-facing UI text is hiragana.

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

- `rhythm-engine.ts`: the timing heart. Master clock is `AudioContext.currentTime` — never `Date.now`/`setTimeout` as a timing source. A two-clock scheduler (coarse `setInterval` decides *what*, AudioContext decides *when*) keeps audio sample-accurate regardless of JS jitter. It reconciles three coordinate systems: taps live in `performance.now()` ms (bridged via `getOutputTimestamp()`, with a start-time offset fallback), beats live in AudioContext seconds, and the child *hears* beats `outputLatency` later (fallback: `baseLatency`). `deviceOffset` corrects input latency. `onTap` distributes raw asynchrony only — no pass/fail judgment here; scoring and the debug display attach to the same stream in parallel. A second track (`schedulePattern` / `armPatternTargets` / `handlePatternTap`, addendum A1-2) schedules beat-grid target onsets and matches taps to the nearest target with the same measurement discipline; the per-beat pulse matching is untouched. Since A2 the echo response phase no longer arms pattern targets (shape scoring works on raw tap timestamps); the target-matching track stays for beat-aligned pattern modes (A1-9).
- `pattern-player.ts`: short-pattern playback (echo/perception modes), same AudioContext, schedules all onsets at once.
- `audio.ts`: singletons for the shared AudioContext and engine. `AudioContext.resume()` must happen inside a user gesture (iOS Safari), which is why `RhythmEngine.start()` is called from tap handlers.

### `src/core/` — pure policy layer (no side effects, no DOM/audio)

- `scoring.ts`: pure scoring functions. Sync grading uses relative error `r = |async| / IBI` (auto-scales to tempo): `r ≤ 0.15` perfect, `≤ 0.30` good, otherwise `none`. Echo requires onset-count match and every IOI relative error ≤ 0.30. Also `median` and `coefficientOfVariation` stats.
- `patterns.ts`: the A1 beat-grid layer — 4-cell grids (`hit`/`rest`/`split`), grid expansion to target onsets, the tempo rule (split patterns run at SMT × 1.6), the 22-pattern set in 2 unlock levels (quarter-only vs split-containing, A3-1), and whole-pattern scoring (`scorePatternAttempt`: one-to-one nearest assignment, local-IOI denominators, extra taps recorded but never punished). The echo screen uses the A2 subset instead: `ECHO_PATTERNS`/`ECHO_PATTERN_GROUPS` exclude trailing-rest patterns (A2-5; sole exception `hrhr`, A3-2), and its response phase is scored by `scoreEchoShape` (A2-4) — first-tap-relative shape matching with a span-ratio tempo scale `s` (valid 0.5–2.0×), so the child starts whenever they like and tempo differences don't matter.
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
