# Play improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver all approved creation, combat/chat and tabletop fixes, including the DOCX requirements and automatic vision.

**Architecture:** Extend the existing React client, typed deterministic rules engine and authoritative Supabase RPCs. Three independent workstreams own their UI and backend boundaries; integration verifies the combined behavior. Use additive migrations numbered 016 for combat/chat and 017 onward for maps.

**Tech Stack:** React 19, TypeScript, Supabase/PostgreSQL, Node test runner/PGlite, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-character-creation-combat-tabletop-design.md`, approved by user on 2026-10-28, including proposed defaults.

## Global Constraints

- All new player-facing labels, help, validation, accessibility text and chat content must be in **Brazilian Portuguese**.
- Preserve existing characters, campaigns, saved sheets, messages, immutable compendium references and the user's pending `.gitignore` change.
- Use new additive migrations after the existing migrations; never rewrite a deployed migration.
- Preserve Git's CRLF setup; avoid whole-file formatting churn.
- Work only in `/home/tony/.codex/worktrees/play-session-improvements/WEIRS-RPG`, branch `codex/play-session-improvements`.
- No hosted deployment, remote migration/seed, push, merge or external messages in this implementation.
- Root alone stages/commits integrated changes; workers edit only their assigned files and report tests. Coordinate disjoint sections in shared type files before editing.
- Node runtime: `/home/tony/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. `npm` is unavailable; invoke local JS entry points directly or use bundled pnpm. Dependencies are linked from the original checkout.

## Review Focus

- Optional lineages absent from a selective catalog must still be discovered with a scoped list (Task 1 browser test).
- One aborted cache subscriber must not cancel another or cache an aborted success (Task 1 repository test).
- HP retries must return the same dice and mutate once even after a lost response (Task 2 SQL test).
- A door/layer/assignment edit must invalidate visibility before a stale mask/receipt can authorize data (Task 3 SQL/snapshot test).
- Existing scenes, fixed grants and old sheets must retain their meaning after additive changes (Tasks 1–3 compatibility tests).

---

### Task 1: Character creation and compendium cache

**Files:**
- Modify: `tools/compendium-import/species-choices.ts`, `packages/character-creation/concessions.ts`, `project.ts`, `defenses.ts`, relevant species effect types only in `packages/contracts/compendium.ts` when required.
- Modify: `apps/web/features/character-creation/SpeciesStep.tsx`, `HitPointStep.tsx`, `ChoicePanel.tsx`, `ClassStep.tsx`, `BackgroundStep.tsx`, `SpellStep.tsx`, `CharacterCreator.tsx`, `apps/web/styles/character-creation.css`.
- Create: `apps/web/lib/compendium-cache.ts` and focused UI/helper modules where needed.
- Modify: `apps/web/lib/compendium.ts`, `compendium-source.ts` only to wire the cache boundary.
- Test: `tests/character-species-choices.test.ts`, `character-lineages.test.ts`, `character-linked-equipment.test.ts`, new cache tests and relevant `tests/browser/creation-*.spec.ts`.

**Interfaces:**
- Consumes: existing `CompendiumRepository`, `CreationDraft`, `CreationCatalog`, resolved origins and `CompendiumTooltip`.
- Produces: `createCachedCompendiumRepository(repository: CompendiumRepository, options?: { maxEntries?: number; ttlMs?: number; now?: () => number }): CompendiumRepository` with successful result reuse, independent subscriber cancellation and current query TTL default 300000 ms.
- Keep all canonical refs/choice IDs in the existing draft. Expose starting kit controls in step 5 and fixed/removable spell chips by profile.
- Only this task edits species/creation areas. Task 2 owns spell metadata sections in shared compendium types/serializer/adapter; coordinate rather than rewrite files.

- [ ] Add and run failing tests for Inamon trait visibility and level 1/7/11 choices/effects, proficiency-based weapon selection and retained N0-V4 behavior.
- [ ] Add explicit curation using source values and stable source identities, ensuring fixed traits are visible independently of choices. Generate updated compendium artifacts through the existing tools; preserve old revisions.
- [ ] Add and run failing UI/helper tests for single-form/size hiding, real alternatives, optional lineages discovered via scoped list, loading/error distinction and dependent reset.
- [ ] Implement conditional controls using actual choice availability, preserving canonical default values.
- [ ] Add and run failing tests for starting class/background equipment kits visible in step 5, multiclass exclusion, kit swapping and linked equipment decisions.
- [ ] Reuse `EquipmentChoices` in the step 5 equipment section; show earlier-step summaries rather than duplicate prompts.
- [ ] Add and run failing cache tests for query/reference keys, pagination, success reuse, in-flight coalescing, one/two aborted consumers, retry after rejection, expiry, capacity and account/repository separation.
- [ ] Implement cache at repository boundary and wire all creator consumers, retaining stale-result guards and explicit retry behavior.
- [ ] Add and run failing browser tests for chips, hover/focus/touch descriptions, remove independently of search filters, fixed grants and preparation/quota behavior.
- [ ] Implement chips with existing tooltip and canonical selection callbacks.
- [ ] Run the changed test files and typecheck; report exact commands/results and any remaining scope concern. Root performs full-suite integration and commits after review.

### Task 2: Combat expressions and chat actions

**Files:**
- Create: `supabase/migrations/202610280016_combate_chat.sql`, `apps/web/features/session/HitPointExpression.tsx`, focused expression/action helper modules.
- Modify: `packages/contracts/session.ts`, `chat.ts`, optional spell/skill metadata in `sheets.ts` and spell-only sections of `compendium.ts`.
- Modify: `packages/compendium/decode.ts`, `sheet-adapter.ts`, `tools/compendium-import/sql.ts` and spell importer metadata paths.
- Modify: `apps/web/features/session/SheetPlay.tsx`, `token-actions.ts`, `CombatPanel.tsx`, `apps/web/features/tabletop/TokenActions.tsx`, `apps/web/features/chat/Message.tsx`, `apps/web/features/Chat.tsx`, `apps/web/features/sheets/SheetChat.tsx` and spell/skill editors/validators as needed.
- Test: `tests/session-database.test.ts`, `chat-database.test.ts`, `spell-damage-database.test.ts`, `token-actions.test.ts`, relevant browser suites/backends.

**Interfaces:**
- Consumes: current `SessionCommand`/receipts, `ChatCommand`, server dice grammar, current authorized saved sheets and source data.
- Produces: optional HP command `expressao: string` alongside compatible numeric `valor`; exact temporary HP operation; structured result receipt containing expression and rolls.
- Produces: structured description action/result within existing action messages; spell attack/save metadata remains optional for backward-compatible sheets.
- Chat damage callback loads current sheet version, dispatches existing `dano`/`magia_dano`, preserves secrecy and idempotency.
- Task 1 owns species/creation data. Coordinate shared files; Task 3 owns all tabletop files except `TokenActions.tsx`, reserved here.

- [ ] Write and run failing SQL tests for `8+4`, `12-3`, `2d8+3`, NPC deltas, negative/malformed/limit rejection, zero, temporary HP absorption, stale versions and duplicate-receipt identical dice/mutation once.
- [ ] Implement authoritative expression evaluation inside the existing session transaction, preserving current access helpers and numeric clients. Return the applied result; never roll client-side then separately mutate HP.
- [ ] Write and run failing tests for exact temporary HP reduction/clear while retaining existing grant semantics; implement `Definir PV temporários`.
- [ ] Add a shared text expression control to all damage/heal contexts, pending state and pt-BR feedback; retain exact-value editors for absolute HP.
- [ ] Write and run failing chat tests for damage after sheet-version changes, lost permissions/deleted entry/no damage and inherited secrecy.
- [ ] Add accessible `Rolar dano` buttons using current saved action definitions and current authorized sheet versions.
- [ ] Write and run failing import/adapter/SQL tests for attack modifier, save CD/ability, long descriptions and old/custom spell compatibility.
- [ ] Thread actual optional spell metadata end to end. Implement server-resolved description snapshots for spells/attacks/features/traits/talents/skills; accurately handle entries with no description and optional skill descriptions.
- [ ] Add sheet name/description actions without replacing roll controls; update chat cards and mock backends together.
- [ ] Run changed tests and typecheck; report exact commands/results and remaining scope concerns. Root performs full-suite integration and commits after review.

### Task 3: Tabletop interaction and authoritative vision

**Files:**
- Create: map migrations `202610280017_*.sql` onward, `packages/tabletop/vision-geometry.ts`, `apps/web/features/tabletop/WallTools.tsx`, `VisionFog.tsx`, layer/assignment and ruler helper components.
- Modify: `packages/contracts/tabletop.ts`, `apps/web/lib/tabletop.ts`, `apps/web/features/tabletop/useTabletop.ts`, `Tabletop.tsx`, `MapEditors.tsx`, `AreaTools.tsx`, `SpellAreas.tsx`, `geometry.ts`, `agility-geometry.ts`, map history modules and tabletop CSS.
- Test: new vision SQL/geometry tests, `tests/tabletop.test.ts`, `agility.test.ts`, map geometry/history tests and browser tabletop/agility suites/backends.
- Do not edit `TokenActions.tsx` (Task 2 owns HP changes); coordinate via its existing props/contracts.

**Interfaces:**
- Consumes: current scene/token/area models, atomic versioned `MapCommand`/receipts and session ownership rules.
- Produces: additive layer, wall/door, placed-object, assignment, elevation/sight and area-anchor contracts; `MapSnapshot` carrying consistent scene/visibility revision, authorized entities and current/explored masks.
- Produces: authoritative `ler_mapa_visivel` RPC for automatic scenes and equivalent SELECT/RPC/asset protection; ephemeral invalidation events contain no private row data.
- Pure geometry module exports bounded cell-center, ray/segment intersection and visibility-mask functions with matching TS/SQL fixtures; masks limited by existing 100×100 scenes.
- Ruler model keeps drafts versus pinned session/scene measurements and style separately; cell-center snapping always applies, including movement overlays.

- [ ] Write and run failing geometry tests for ruler start/waypoint/end centers, boundaries/zoom, even-sized token movement anchors and Euclidean height mode; implement shared helpers and persistent styled rulers/options/delete controls.
- [ ] Write and run failing browser tests for pointer-follow area preview, explicit orient/confirm/cancel, numeric/rotary angle, linked-token movement/rotation option and aura visibility; implement explicit phases/anchor offsets with compatibility migration.
- [ ] Write and run failing SQL tests for owned-player token creation/deletion and atomic controlled batches, mixed unauthorized/stale/locked members and admin-field forgery; implement server authorization plus player group selection UI and readable condition/elevation markers.
- [ ] Write and run failing SQL/model tests for arbitrary layers, atomic layer moves, placed objects, hidden rows/assets, assigned scenes/spectator following and access revocation; implement additive data model/migrations, client repositories/controls and compatibility conversion.
- [ ] Write and run shared TS/SQL visibility fixtures for range, walls/doors, tangency/corners/collinearity, locked-owned sight, per-user union, zero sources, token center/covered object visibility, current versus explored and resize coordinate preservation.
- [ ] Implement server-owned cell masks and consistent snapshot RPC. Dirty visibility revisions fail closed until rebuilt; recheck receipt replay and all reference/asset access paths. Public combat/chat remains explicitly public, with disclosure in DM controls when adding private tokens to public combat.
- [ ] Implement DM walls/doors/range UI, automatic/manual mode compatibility, per-player explored fog and `VisionFog` renderer; only confirmed movement explores, walls block sight without adding collision/pathfinding.
- [ ] Add integration/browser tests for door/layer/assignment changes while requests are in flight, absence of hidden DOM/list/focus rows, spectator follow and no-source notices. Benchmark maximum scene size with representative multi-source/wall counts; distinguish mock UI from actual SQL/Realtime checks.
- [ ] Run changed tests and typecheck; provide detailed coverage of each spec C1–C6 item, commands/results, performance and any remaining scope concern. Root performs full-suite integration and commits after review.

### Task 4: Integration, release notes and verification

**Files:**
- Modify: `tests/content-import.test.ts` only after verifying campaign source counts; deployment/configuration docs for new migrations, seeds and workflows.
- Update: this plan and the SDD progress ledger with completed checks/review findings.
- Resolve shared interface conflicts; do not reformat unrelated source files.

**Interfaces:**
- Consumes: verified deliverables of Tasks 1–3 and their test reports.
- Produces: integrated local feature branch, passing relevant checks, release instructions and a self-contained user summary identifying hosted release work separately.

- [ ] Independently review each task's diff and report, and fix all actionable correctness/security/spec gaps with the owning worker.
- [ ] Verify current campaign session/biography source counts and repair the known stale assertion with a meaningful source fixture/regression check.
- [ ] Run full `node --import tsx --test tests/*.test.js tests/*.test.ts`, `node node_modules/typescript/bin/tsc --noEmit`, production build script equivalents and relevant Playwright suites; inspect desktop/mobile screenshots.
- [ ] Exercise SQL policies directly, including hidden rows, storage references, actor/spectator/assignment changes and receipt replay. Run available local transport smoke or explicitly state if infrastructure prevents hosted/Realtime validation.
- [ ] Obtain independent final code review, fix findings, rerun affected verification and update docs/ledger with exact evidence.
- [ ] Commit only reviewed task files under the configured email. Keep the branch and worktree for user review; do not push/merge/publish without a subsequent release request.
