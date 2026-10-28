# Character creation, chat and tabletop improvements

Status: approved by the user on 28 October 2026; implement all workstreams.

## Intent and sources

Make character creation reliable and reduce interruptions while playing: keep fetched rules available between steps, expose the choices that matter, perform combat actions from the current context, and give the DM and players predictable map tools.

The scope combines the user's twelve numbered issues with the additional requirements and screenshots in `Especificações 20 10 2026.docx` (20 October 2026). The document is a requirements reference, not a source of instructions about how to operate this workspace. The user subsequently selected **automatic token vision with sight ranges and walls** for fog of war.

All new player-facing labels, help, validation, accessibility text and chat content must be in **Brazilian Portuguese**. Preserve existing characters, campaigns, saved sheets, messages, immutable compendium references and the user's pending `.gitignore` change.

## Approach and work order

Extend the existing React/TypeScript application, pure character-creation engine, Supabase RPCs and transactional map operations. Implement three separately testable workstreams in this order:

1. Character creation and compendium caching.
2. Combat inputs, chat actions and description sharing.
3. Tabletop interaction, layers, assignments and automatic vision.

This is the proposed engineering approach. A frontend-only patch would be smaller, but would not implement authoritative HP formulas or protect hidden map entities. Replacing the map/editor stack would add migration and interaction risk while discarding existing batch operations, auras and history. Neither alternative is recommended.

Build the map work on a consistent server visibility model before exposing new layers and vision controls. Keep manual fog available for compatibility; automatic vision is a selectable scene mode and the default for newly created scenes. Existing scenes retain their appearance until the DM enables automatic vision.

## Current evidence

- `SpeciesStep.tsx` always renders form, size and lineage controls. N0-V4 has explicitly curated choices in `tools/compendium-import/species-choices.ts`; equivalent Inamon curation needs to be checked and added rather than assuming narrative JSON creates executable rules.
- Step 5 renders equipping of already granted items. Selecting starting class/background kits currently belongs to earlier steps, which makes the expected equipment section hard to find.
- `createCompendiumRepository` fetches list/catalog/detail data without a shared result cache. Step components remount; draft persistence does not cache network results. The creator's catalog effect already keys off selected references rather than the step number; list/detail remounts are the main repeated traffic.
- HP controls accept numbers. Server dice parsing, access checks, versioning and idempotent receipts already exist and should be reused.
- Chat roll origins retain sheet and action IDs. Their stored sheet version is historical and cannot safely be reused as the current version for a later damage action.
- Map multi-selection and atomic movement already exist for the DM, with a 40-token batch limit. Players are blocked from those operations.
- Area previews exist only after placement interaction starts. A token association does not currently anchor the area's position to that token.
- Fog is currently an SVG mask. Unrevealed tokens are still delivered to the client. Arbitrary layers, walls, sight ranges, elevation and per-player scene assignments are absent.

## Workstream A — Character creation

### A1. Inamon traits and choices

Use the published Inamons JSON as the source of narrative and numeric values; retain its existing species identity and expose its traits like other species. Add explicit, typed curation for its integrated-weapon choice and Inamonic improvements, using the same published-choice/concession pipeline as N0-V4.

- Display the species' fixed racial traits independently of choice controls. Treat these as traits/configurations, not general compendium `talento` records.
- At level 1, choose one improvement; from level 7, choose a second distinct improvement.
- Preserve descriptions for all choices, including narrative effects that the engine does not automate.
- Apply supported flight, walking/climbing movement and armor formulas through typed effects, including the carapace change at level 11. Do not invent extra attacks or shield stacking for additional arms.
- The integrated weapon must be an eligible weapon with which the completed character is proficient. Before class choices establish proficiency, explain that this decision can be completed later; do not silently pick or grant an illegal weapon.
- Re-evaluate eligibility after class/level changes. Preserve valid choices and surface or remove invalid dependent choices consistently with existing reconciliation.
- Keep published revision IDs immutable; produce updated revisions through the established importer/seed workflow.

### A2. Conditional species controls

Derive distinct forms, valid sizes for the selected form, and lineage availability from the actual catalog.

- Hide `Forma` when there is no choice; assign its sole/default value internally.
- Hide `Tamanho` when the selected form has a single size; keep the canonical size in the draft and preview.
- Hide `Linhagem` when there are no available lineages. Determine availability with a cached scoped lineage list; the selective production catalog does not include unselected inbound lineages. `lineageRequired === false` means optional, not unavailable. An empty response must be distinguished from loading/error; required lineages must still be enforced.
- Retain selectors for N0-V4 and any species with real alternatives. Changing species/form clears incompatible selections and recomputes the default without a transient invalid saved sheet.

### A3. Starting equipment in step 5

Give step 5 a visible `Equipamentos iniciais` section. Present starting class and background kit/coin choices there, grouped by source, with descriptions, quantities and currency. Reuse existing canonical equipment selections and their stable IDs instead of creating parallel state.

Class/background steps may show a brief summary linking to step 5; do not ask the same question twice. Only the initial class grants starting equipment, not multiclass entries. Keep a separate `Equipar itens recebidos` subsection for armor, shield and weapon setup, with a useful explanation when no equippable items were received. Kit swaps must prune equipment no longer owned.

### A4. Reusable compendium cache

Place caching at the repository boundary so list, detail/context and creation-catalog consumers benefit, rather than caching only individual step components.

- Canonical keys include the full query, rule set, pagination, source/class/parent filters and immutable record/revision references; deduplicate and sort reference sets.
- Reuse completed results and coalesce identical concurrent requests. Different consumers' cancellation must not cancel a request still needed by another consumer.
- Cache successful results only; aborted, rejected or malformed responses must be retriable. A retry/refresh must bypass stale failure state.
- Bound cache size. Proposed defaults: a five-minute lifetime for current-list/catalog queries and bounded session reuse for pinned immutable revisions.
- Scope mutable/session caches to the repository/account lifecycle and clear them on account/repository changes. Never cache authorization for mutable sheets, campaigns or combat operations as though it were compendium data.
- Maintain draft choices when stepping forward/back or opening tooltips. Avoid refetching unchanged catalogs on simple navigation; a genuine origin/revision change must get its own correct catalog.

### A5. Selected-spell chips

Render selected spells in step 6 as removable chips grouped by casting origin/profile. Reuse the existing compendium tooltip for full spell descriptions and metadata; support keyboard focus and touch as well as hover. Preserve provenance and separate copies granted by different sources. Removing a chip updates the same canonical selection and preparation/quota validation as the list controls, independent of the current search/page/filter. Fixed grants are labeled and non-removable; spellbook preparation controls and separate quotas remain available.

## Workstream B — Combat and chat

### B1. Calculations and dice for HP

Use a shared expression input across session sheets, token controls and combat/NPC damage/healing controls. Keep absolute numeric HP editors where they represent an exact saved value. Examples in the UI: `8 + 4`, `12 - 3`, `2d8 + 3`.

The first supported grammar is the existing dice grammar: integers, addition/subtraction, dice and existing keep-high/keep-low syntax. Multiplication, division and parentheses are not silently accepted. The server validates length/dice/face limits and requires a nonnegative integral final HP amount; zero is allowed. Never evaluate arbitrary JavaScript.

Resolve dice, validate the current target/version, apply HP and save the result receipt in **one transaction**. Retrying the same request returns the same dice and applies HP once. NPCs receive true delta operations rather than client-calculated absolute HP. Preserve damage absorption by temporary HP, normal HP bounds and existing ownership/master rules.

Return the expression, rolled terms and final amount for visible confirmation beside the control. Do not send a separate chat message automatically unless the user chose a chat roll. Failed or stale-version requests must not apply partial HP changes.

### B2. Temporary HP

Show the current temporary HP clearly and provide `Definir PV temporários` as an exact-value action, including reduction and clearing to zero. Do not silently reinterpret the existing grant operation, which keeps the greater of old and granted temporary HP. Label each retained behavior accurately.

### B3. Damage directly from chat

Add `Rolar dano` to eligible attack/spell chat cards. On click, load the current authorized saved sheet, confirm the source entry still exists and has damage, and dispatch the existing damage action with a fresh request ID/current version. Use the current saved damage definition; the old attack message remains an immutable historical roll.

The button must work after unrelated HP/resource edits increment the sheet version. A deleted entry, removed damage or lost permission produces a clear pt-BR message. Disable duplicate clicks while a request is pending and use the existing retry/idempotency flow. A secret attack's follow-up damage remains secret by default; never expose another user's private sheet through the callback.

### B4. Spell information and description cards

Show the relevant attack modifier or save CD/ability on spell chat cards. Thread optional attack/save metadata from source JSON through importer, decoder, sheet adapter, editor, validation and authoritative chat results. Preserve old/custom spell sheets; do not guess an unknown saving throw from unrelated text.

Provide an accessible `Enviar descrição ao chat` action beside spell, attack, feature/trait/talent and skill names in the sheet. Preserve the existing roll buttons. Resolve saved descriptions server-side and store a plain-text structured snapshot, so subsequent edits do not rewrite history. Use attack observations/linked equipment descriptions where available. For a skill with no description, expose the absence accurately rather than fabricating rules; allow optional descriptive text in its editor if needed.

Long descriptions may be collapsed in chat but must remain available in full within the existing sheet-description limit. Reuse existing message/action storage where feasible and retain ownership, spectator restrictions, retry handling and secret-message behavior.

## Workstream C — Tabletop

### C1. Ruler and measurement options

Snap every ruler start, waypoint and endpoint to `floor(coordinate) + 0.5`, bounded to the scene. This applies even when the visible grid is disabled and during zoom/pan. Use a single geometry helper for pointer and keyboard paths.

The ruler tool opens a compact options panel with color, thickness and line/dash style, plus `Fixar régua`, `Excluir régua` and `Medir movimento`. Keep explicit status/help during measurement. A pinned ruler survives switching tools in the current scene; Esc cancels only the active draft. Proposed persistence: private to the current browser session, keyed by scene, including scene changes; no shared ruler broadcast is implied.

Movement measurement draws from the initial token position to the proposed final position without modifying saved coordinates before commit. Group movement preserves formation and permissions. All ruler control points use cell centers, including movement overlays: map the token footprint center through the same cell-center helper, with a deterministic choice for even-sized tokens.

Retain the existing D&D horizontal grid-distance metric. A clearly labeled height mode accepts start/end elevations in feet and reports horizontal distance, height difference and hypotenuse separately; do not silently change ordinary diagonal measurement.

### C2. Spell placement and tool feedback

Make placement phases explicit: `Posicionar`, `Orientar`, `Confirmar`. While positioning, the preview follows the pointer before the first click. Dragging or a numeric/rotary angle control changes orientation. Show the affected shape/cells with a contrasting outline; do not save until confirmation. Esc and `Cancelar` leave no area behind.

Use consistent selected-tool state, cursor, short action instructions, pending/saved feedback and error recovery across ruler, area, walls, fog, draw and token selection. Keep controls keyboard accessible and usable on touch.

Fix token-linked areas by storing anchor offsets and deriving their effective world position from the token. Migration preserves existing positions. Proposed default: follow translation; keep world angle unless the user enables `Acompanhar rotação`. Reuse the token aura feature, expose its radius in feet and ensure the preview follows token movement. Auras remain non-mechanical visual indicators.

### C3. Tokens and group control

Expose existing DM multi-selection more clearly and allow players to select/move only tokens they currently control, using Shift-click, a selection rectangle and list checkboxes/touch controls. Preserve the 40-token limit, group formation, scene bounds, version checking and atomic server batches. A forbidden/stale member rejects the entire mutation.

Let players add a token for their own accessible character and remove a token they control; neither action deletes the character sheet. Server checks the current scene/layer, owner/controller, image access and locks. Players cannot assign a different controller, link someone else's sheet, create hidden tokens, move into a private layer or mutate administrative fields. DMs retain control of all tokens. Do not permit player duplication as an accidental consequence of enabling batch movement.

Replace the condition dot with legible accessible condition markers, keeping concentration and HP indicators. Add optional position/elevation display (`X`, `Y`, `Altura`) in scene feet. Elevation is explicit numeric state; it affects height measurement, not two-dimensional wall occlusion.

### C4. Layers and per-player scene assignment

Add versioned scene layers with name, order, visibility and lock state. Seed compatible `Mapa`, `Jogadores` and private `Mestre` layers; the DM may create additional layers. Support tokens, spell areas and placed images/drawings as layer members. The scene's existing single background remains supported; additional map images are placed objects.

Move selected tokens/objects between layers atomically. Showing/hiding a layer changes all its members without overwriting their individual hidden flags. Private layers and their members must be absent from player queries, responses, DOM, focus targets and asset lists. Visibility and edit permission are separate predicates; controlling a token does not override a private layer.

Add scene assignments per campaign member. The DM can send the whole party or selected participants to a published scene; each player renders only the assigned scene. Existing active-scene behavior becomes the default assignment for existing campaigns. DMs can preview other scenes without changing player assignments. Explicitly assigned spectators can view their scene but cannot edit. For automatic vision, the DM assigns a spectator a player to follow; until configured, the spectator sees fog and an explanatory notice. A player with no sight-enabled controlled token likewise sees fog and a notice. Revocation and role/assignment changes clear stale map state, selections and object URLs.

Introduce explicit placed-object/drawing rows for content that must have per-layer visibility; do not embed secret objects in a scene JSON blob readable by all players.

### C5. Automatic vision and fog of war

Add DM-editable wall segments with closed/open door state, and per-token sight enabled/range fields. Use deterministic two-dimensional line-of-sight with scene bounds, configured sight radius and opaque wall segments. Proposed defaults: 360-degree sight with a 60-foot configurable Euclidean radius for character-controlled tokens; no vision from unowned NPCs. A player's current visible area is the union of their controlled sight-enabled tokens in their assigned scene; the DM sees the full scene. Sight-source ownership must be separate from movement permission: locking an owned token must not make it go blind, while private layers and scene audience restrictions still apply.

Wall and sight controls use the same units as the scene. The DM can draw/delete walls, open/close doors and adjust ranges with immediate preview. Open doors do not block sight. Walls block vision; movement collision/pathfinding is not included. Elevation does not create extra floors, vertical walls or lighting rules in this iteration.

Automatic fog distinguishes currently visible space from remembered explored space. Remembered space may show a dimmed backdrop, but enemies/objects require **current** visibility. Proposed default: remember exploration per player and scene, with a DM reset action. Moving a token, editing a wall/door, changing sight/ownership or changing assignments must invalidate the relevant visibility promptly. Only confirmed token positions reveal/explore space; a local drag preview does not explore its intermediate path.

Use an authoritative cell-visibility mask, matching the map's existing maximum of 100 by 100 cells. A cell is currently visible if its center is in range and unobstructed from an eligible source. Render contiguous cell runs as the fog mask. Maintain a pure TypeScript parity implementation for DM previews/tests; a player-supplied mask is never authoritative.

An automatic-scene snapshot RPC returns the visibility revision, current/explored masks and authorized entities consistently. It replaces independent token/area fetches in this mode. Recompute or fail closed after token movement, ownership/range changes, wall/door edits, layer changes or assignment changes; never use an old cached mask under a newer visibility revision. Exploration memory is updated by the server from authorized visibility, not trusted client exploration claims.

The initial visual resolution is one map cell, so range/shadow boundaries have cell steps even with the grid hidden. Do not imply continuous polygon precision. Bound candidate cells to source ranges and discard nonintersecting walls before ray tests; benchmark the maximum scene with multiple sources/walls before claiming responsiveness. Use quantized coordinates and common TS/SQL fixtures for tangent, collinear and wall-endpoint rules. Resizing a scene preserves exploration by coordinates (not raw bit offsets), clipping out-of-bounds cells; it never turns explored space into current vision.

Entity eligibility is explicit: a token is visible when its center cell is currently visible; an area, drawing or placed image is eligible when any cell it actually covers is currently visible. Clip eligible area/object rendering to the current mask. A partially visible area's/object's complete geometry or asset may be delivered; wholly unseen entities are absent. Reuse a consistent segment-intersection/range model with explicit corner/endpoint handling and parity tests. A player must not fetch a wholly unseen map opponent through direct SELECT, an RPC, an old receipt, an image reference or a map list. Controllers retain access to their own tokens for management; that does not grant vision through walls or private layers.

Fog rendering covers the assigned scene backdrop. The ordinary base image remains a delivered scene asset; fog is not a promise that its original image bytes can never be inspected. Strict secret-pixel delivery through server-generated tiles is a separate architecture and is not included. Assets belonging exclusively to private layers/hidden scenes remain inaccessible under Storage policies, independent of visual fog.

Map privacy does not erase already public chat or combat-tracker information. NPCs explicitly entered into the shared combat tracker remain shared combat participants even if their map representation is hidden. Adding a private token to that public tracker must make this disclosure clear in the DM control; do not add map-only hidden NPCs to public combat implicitly. A private initiative/encounter subsystem is outside this map-layer change.

### C6. Server model and compatibility

Use new additive migrations after the existing migrations; never rewrite a deployed migration. Extend contracts, repository decoders, mock backends, operation receipts and history together. Keep versions and idempotency for all authoritative mutations and recheck access before replaying stored responses.

Centralize current campaign role, scene assignment, layer visibility, token control and current-vision checks in private server helpers. Apply them consistently to SELECT, RPC return payloads, assets and mutation validation. Realtime notifications should trigger authorized refresh/invalidation without containing private row contents. Existing polling is a recovery path, not the sole revocation mechanism.

Use focused modules for ruler state, area placement, layers and vision instead of growing the already large `Tabletop.tsx` further. Preserve camera behavior, undo/redo and concurrency handling; include new entity operations in history only where an inverse can be authorized and version checked safely.

## Validation and acceptance

1. Import actual source data and verify Inamon levels 1/7/11, integrated-weapon proficiency, unique choices and unchanged N0-V4 behavior.
2. Browser tests for single-choice fields hidden, real alternatives retained, lineage loading/errors, equipment visible in step 5 and valid sheet generation after kit swaps.
3. Request-count tests for forward/back navigation, list pages, repeat tooltips, concurrent subscribers, cancellation, retries, TTL, changed revisions and account changes.
4. Keyboard/touch/hover spell-chip tests preserving profile identities, preparation state and limits.
5. SQL tests for numeric/arithmetic/dice HP, NPC deltas, temporary HP exact set, malformed/negative/out-of-limit expressions, stale versions, access loss and duplicate receipts returning identical rolls.
6. Chat integration tests for damage after sheet-version changes, missing source entries, spell attack/save metadata, long descriptions, secret rolls and unauthorized follow-up actions.
7. Geometry and browser tests for ruler cell centers at all phases, pan/zoom/bounds, styles, tool changes, deletion, movement overlays and height mode.
8. Browser tests for hover placement preview, orientation, cancel/confirm, linked areas, auras, readable conditions and controlled multi-selection on mouse/keyboard/touch.
9. SQL policy tests for layers, groups, assignments, assets and receipts across DM, controller, other player, spectator, revoked member and outsider. Test direct queries as well as RPCs, and ensure partial batch failure rolls back everything.
10. Vision parity tests for radius, doors, wall endpoints/corners, overlapping controlled sight, unseen enemies, exploration memory, assignment changes and in-flight stale responses. Browser assertions verify that hidden entities do not remain in DOM/list/focus state.
11. Distinguish mock-backend UI tests from real server policy/transport checks. Run a local integration smoke of visibility/revocation where infrastructure is available; do not claim hosted deployment or Realtime verification from mocks.
12. Run the full unit/database suite, typecheck and production build, then relevant browser suites and review screenshots at desktop/mobile sizes. Preserve pt-BR text and the existing CRLF Git configuration.

## Baseline and release boundary

Before edits, typecheck passes. The unit/database suite reports 375 passes and one existing failure: `tests/content-import.test.ts` expects 16 campaign sessions while current source imports 19. Verify that assertion against the source rather than masking an importer regression when restoring the full green baseline.

This work prepares local source, migrations, generated compendium updates and deployment instructions. Applying migrations/seeds or deploying the creation Edge Function/hosted app is a separate concrete release action; do not imply local validation updates the hosted game.

## Decisions proposed for approval

- Extend the existing architecture in three workstreams; keep current saved data compatible.
- Add automatic vision based on each player's controlled tokens, sight ranges and 2D walls/doors, with remembered explored backdrop and current visibility for other entities.
- Use server-owned cell masks, explicit spectator follow-player assignments and fog for participants with no sight source. Base image bytes and already public combat/chat history are outside the secrecy guarantee.
- Keep pinned rulers private to the browser session/scene; no shared ruler persistence is required by this design.
- Follow current saved attack/spell damage definitions from chat rather than replaying old formulas.
- Support the current addition/subtraction/dice grammar for HP; clearly reject other arithmetic operators.
- Use exact temporary HP editing, and descriptions from actual saved sheet data.
- Fix all twelve reported areas plus the additional DOCX requirements listed above; keep every in-game string in pt-BR.
