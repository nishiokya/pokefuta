---
name: pokefuta-ui-smoke
description: Verify this pokefuta repository's core logged-out UI/business behavior with a small visual smoke test. Use when Codex is asked to confirm that the top page or map page still renders correctly, that public logged-out business logic is intact, or that layout regressions have not been introduced in the Next.js app.
---

# Pokefuta UI Smoke

## Overview

Use this repository-specific skill to check the two most important public screens: the top page (`/`) and the map page (`/map`). Keep the scenario small, but run it carefully enough to catch obvious business logic and visual regressions without logging in.

## Test Mode

- Test as a logged-out user only.
- Do not create an account, request a magic link, complete OAuth, or use production user credentials.
- Use the local app unless the user explicitly asks for another target.
- Prefer the in-app browser for visual checks when available. Screenshots are useful evidence, but do not block the result if the browser tool cannot capture them.
- Do not print secret values from `.env.local`. It is acceptable to confirm whether required variable names exist.

## Local Setup

1. Inspect `package.json` and use the existing scripts.
2. If dependencies are already installed, run static checks first:

```bash
npm run type-check
npm run lint
```

3. Start the dev server:

```bash
npm run dev
```

4. Use the URL reported by Next.js, usually `http://localhost:3000`.

If the app cannot reach Supabase or public APIs locally, still inspect the rendered logged-out shell and report which data-backed expectations could not be confirmed.

## Viewports

Check at least one mobile and one desktop size:

- Mobile: around `390x844`
- Desktop: around `1280x800`

If only one viewport can be checked, prefer mobile because this app is mobile-first and uses bottom navigation.

## Scenario 1: Top Page

Open `/`.

Expected logged-out business behavior:

- The page reaches a stable state after the initial `読み込み中` state.
- The hero/public section shows `ポケふた写真館`.
- The public feed section shows either `最近の投稿` with photo tiles or the empty state `まだ投稿がありません`.
- The sub information section shows `サブ情報`, `全ポケふた`, and `全投稿`.
- Bottom navigation is visible and includes `ホーム`, `近く`, `アカウント作成`, `マップ`, and `メニュー`.
- No authenticated-only action is required to view the screen.

Visual checks:

- No text overlaps, clipped labels, horizontal scrolling, or broken cards.
- Photo tiles, if present, remain square and aligned in a 3-column mobile grid.
- The RPG window styling remains readable against the dark background.
- Bottom navigation does not cover the main content at the end of the page.

## Scenario 2: Map Page

Open `/map`.

Expected logged-out business behavior:

- The page reaches a stable state after the initial `読み込み中` state.
- The heading is `ポケふたマップ` for logged-out users.
- The explanation says nationwide pokefuta pins are shown and pins navigate to detail pages.
- A map area renders with a visible map container, not a blank collapsed block.
- When public manhole data is available, the count text appears as `全N件のポケふたを表示中`.
- When prefecture counts are available, the floating list shows `都道府県`, `コード順`, and `数順`.

Visual checks:

- The map takes most of the viewport height and is not hidden behind other UI.
- The floating prefecture list stays inside the map area and remains usable.
- Leaflet controls, markers, and attribution do not overlap important app controls.
- Bottom navigation remains visible and does not obscure the map summary.

## Failure Signals

Treat these as issues worth reporting:

- Runtime error overlay, blank page, hydration error, or repeated loading state.
- Public API failure that prevents the page shell from rendering.
- Login-only redirect from `/` or `/map`.
- Map container has zero height or only a blank background after load.
- Content visibly overlaps, extends off-screen, or becomes unreadable at mobile size.

## Report Format

Report concise evidence:

- Commands run and their results.
- Browser target and viewports checked.
- Top page result.
- Map page result.
- Any skipped checks and why.

Use explicit language such as:

```text
Verified logged-out smoke:
- Commands: type-check passed, lint passed.
- Viewports: 390x844 and 1280x800.
- /: public feed shell and bottom nav rendered without visible layout break.
- /map: logged-out map shell, prefecture list, and count rendered without visible layout break.
```
