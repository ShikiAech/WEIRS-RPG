# Persistent Tabletop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep the complete tabletop and editing context stable during realtime synchronization.

**Architecture:** Keep one coherent confirmed view in `useTabletop`, stage asynchronous reads, and commit them together. Separate background refresh from initial/context loading, and reconcile keyed entity controls without version-based remounts.

**Tech Stack:** React, TypeScript, Supabase, Playwright, existing Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-29-persistent-tabletop-design.md`

## Global Constraints

- New interface text in Brazilian Portuguese; no new dependency or database migration.
- Preserve server authorization and authoritative fog; never infer newly visible cells from optimistic positions.
- Preserve IDs, local drafts, selection and focus on ordinary refresh; clear on confirmed access loss/context change.
- Use the existing worktree; keep the local development server available. PR #9 was merged during this follow-up, so branch `codex/persistent-tabletop` starts from the identical tree on `origin/main` (`b73e776`).

## Review Focus

- A notification arrives while an older snapshot response is delayed: older response must not restore obsolete entities.
- A mutation succeeds but its confirmation read fails: token must not snap back.
- An unrelated entity version changes during typing: preserve input node, focus and unsaved value.
- A scene disappears or permission is revoked: clear only after authoritative evidence; do not retain inaccessible assets afterward.
- A snapshot has newer geometry than the scene-list read: render its geometry, fog and entities together.

### Task 1: Browser reproduction and persistent scene state

**Files:** `tests/browser/tabletop-continuity.spec.ts`, `apps/web/features/tabletop/useTabletop.ts`.

**Interfaces:** Retain the hook's public fields. Replace independent scene collection setters with one confirmed view state; `loading` means initial/context load, never routine refresh. `refresh()` still returns a promise and coalesces concurrent reads.

- [x] Add failing real-WebSocket tests for local movement, remote movement, layer refresh and transient read failure; observe full DOM continuity and draft/focus retention.
- [x] Run new desktop tests against existing code and record failure evidence.
- [x] Coalesce optional sheet/session reads per context; do not block critical map commits or discard a slow successful panel read just because a new map notification arrived.
- [x] Stage scene-dependent reads and publish one view only after success and generation/epoch checks; remove the background-only authorization cache and invalidation-time clears.
- [x] Preserve confirmed data on transient failures; clear on actual authorization failure or explicit context/scene change. Keep optimistic movement until an authoritative version settles it.
- [x] Verify new tests and existing movement/privacy cases, including failed confirmation and obsolete response coverage.

### Task 2: Stable editable controls

**Files:** `LayerTools.tsx`, `WallTools.tsx`, `Tabletop.tsx` under `apps/web/features/tabletop/`; a small shared field component if needed; new browser continuity tests.

**Interfaces:** Stable entity IDs own editor lifetime; server values synchronize only when the user is not editing a draft. Existing `operate(command)` and version checks remain.

- [x] Reproduce version-key input remount on an unrelated server update while typing.
- [x] Replace version-based input keys with controlled, draft-aware fields. Preserve current permissions and server conflict handling.
- [x] Assert node identity, focus, draft retention and fresh non-edited values after successful refresh.

### Task 3: Regression contract and delivery

**Files:** Existing background/privacy browser specs, `docs/melhorias-criacao-mesa-2026-10-28.md`, this plan.

- [x] Update obsolete assertions that require clearing already authorized content during revalidation; retain explicit denial, deletion, fog and stale-response tests.
- [x] Run desktop/mobile tabletop browser suites, full unit/database tests and production build/typecheck. Inspect generated browser evidence.
- [x] Obtain independent review of the final diff and address concrete findings.
- [x] Record exact results and limitations, commit verified changes and confirm the local server serves the updated worktree.


## Evidence and implementation rulings

- Reproduction: `output/tabletop-continuity-red.log` and `output/tabletop-continuity-error-red.log` record full DOM removal, not merely a final screenshot mismatch.
- Review regressions: context/pending state, retained coordinates across another operation, nonblocking auxiliary reads, toolbar navigation, failed field saves, profile context fencing, and slow shared sheet reads each failed before their corresponding fix. The profile regression was rechecked with the corrected selector against a temporary minimal revert (`output/tabletop-member-fence-red.log`).
- Independent final review found no remaining material issue in the changed code.
- Final verification: 186 desktop/mobile browser cases passed (`output/tabletop-persistent-browser-final.log`); 474 unit/database tests passed (`output/tabletop-persistent-unit-final.log`); production build/typecheck passed and all 122 legacy files matched (`output/tabletop-persistent-build.log`). Browser scenarios use simulated server responses with the real SDK/WebSocket protocol, not a signed-in production session.
- Ruling: retain the previously authorized full scene until the next authoritative response. Content-free invalidation is a freshness hint; confirmed denial/context change clears it. This deliberately replaces the former immediate-clear assertions.
- Ruling: critical map reads and campaign panel reads have different lifetimes. Slow panel reads are coalesced per context rather than restarted/discarded on each token event; confirmed access denial still fences their result.
- Ruling: keep the current worktree and local server; PR #9 is already merged, so the correction is committed separately on `codex/persistent-tabletop` from the matching main tree.
