# CR026 — Activity Rail + Contextual Panel Navigation

**Status:** In progress
**Created:** 2026-05-19
**Author:** Proposal — pending refinement before scheduling

---

## Implementation Notes (2026-05-19)

First implementation slice landed. The rail + panel architecture is wired up end-to-end; the build is green and the dev server serves all new files cleanly. Visual verification in a browser is still required.

**Shipped in this slice:**
- Theme tokens (`--rail-bg`, `--rail-border`, `--rail-active`, `--rail-hover`) across all three palettes in [theme.css](frontend/src/styles/theme.css).
- `uiStore.railPanelCollapsed` + `toggleRailPanel()` persisted to `localStorage` ([ui.js](frontend/src/stores/ui.js)).
- `meta.rail` on every authenticated route ([router/index.js](frontend/src/router/index.js)); rail active state is derived from `useRoute().meta.rail` — no dual source of truth.
- [ActivityRail.vue](frontend/src/components/sidebar/ActivityRail.vue) — 48px rail, 8 primary icons + 2 bottom, tooltips with `⌘N`, badges (Ideas, Reminders, AI Assist pending pill), left accent stripe on active.
- [ContextualPanel.vue](frontend/src/components/sidebar/ContextualPanel.vue) — panel shell with route-driven `<component :is>` switch.
- [NotesPanel.vue](frontend/src/components/sidebar/panels/NotesPanel.vue) — full extraction of the old sidebar's New Note button, Inbox/All filter rows, Notebooks tree (stacks, create, rename, drag-drop, context menus, delete-with-confirm), and Tags tree. Behaviour-for-behaviour parity with the old sidebar.
- Stub panels for [Tasks](frontend/src/components/sidebar/panels/TasksPanel.vue), [Search](frontend/src/components/sidebar/panels/SearchPanel.vue) (with `localStorage`-backed recent searches), [Graph](frontend/src/components/sidebar/panels/GraphPanel.vue), [Ideas](frontend/src/components/sidebar/panels/IdeasPanel.vue), [Vault](frontend/src/components/sidebar/panels/VaultPanel.vue), [Trash](frontend/src/components/sidebar/panels/TrashPanel.vue), [Settings](frontend/src/components/sidebar/panels/SettingsPanel.vue) (with user/version footer + sign-out).
- [AppSidebar.vue](frontend/src/components/sidebar/AppSidebar.vue) refactored from a 1,178-line monolith to a ~50-line shell wrapping `ActivityRail` + `ContextualPanel` + `RemindersPanel`. Background fetches (notebooks/tags/reminders/ideas) and polling intervals preserved.
- [useRailShortcuts.js](frontend/src/composables/useRailShortcuts.js) — `⌘1`–`⌘8` jump between rail items; `⌘B` toggles the panel. Guarded against firing inside `<input>`, `<textarea>`, or contenteditable.

**Deferred to follow-on slices (CR026.x):**
- Richer panel content for Tasks (Today / Upcoming / Overdue / By Project filter rows), Search (filter checkboxes, saved searches), Graph (move inline filters from `GraphView` into the panel), Ideas (status filter rows), Vault (category filter rows), Trash (type filter rows), Settings (section anchor navigator with `SettingsView.vue` anchor IDs).
- Mobile bottom-tab-bar adaptation of the rail (`<768px` breakpoint).
- Panel resizing (currently fixed at 240px width).
- Acceptance-criteria items dependent on richer panels and view changes (search panel driving `SearchView`, settings panel jumping to anchors, etc.) — these flip green when their respective follow-ons land.

---

## 1. Summary

Replace the single tall left sidebar in [AppSidebar.vue](frontend/src/components/sidebar/AppSidebar.vue) (currently ~1,178 lines, 11 top-level items plus Notebooks/Tags trees) with a **two-part navigation surface**: a narrow icon **rail** (~48px) for top-level destinations/tools, and a **contextual panel** to its right whose contents change based on the active rail icon. This is the VS Code / Obsidian / Linear pattern.

The current sidebar mixes "places" (All Notes, Inbox, Tasks, Ideas, Reminders, Vault, Trash) and "tools" (Search, Graph, AI Assist, Settings) in one flat list. As features grow, that list keeps lengthening and individual features get cramped — Search is currently a single nav row that opens a page, when it should expose filters, saved queries, and history. The rail+panel pattern decouples "where am I" (rail) from "what's available here" (panel), giving every feature room to grow without crowding the global nav.

---

## 2. Goals / Non-Goals

### Goals
- Narrow, icon-only activity rail on the far left — always visible, always the same.
- Contextual panel to the right of the rail whose content reflects the active rail selection.
- Each rail icon is either a **route target** (Notes, Tasks, Ideas, Search, Graph, Vault, Trash, Settings) or a **panel/modal toggle** (Reminders, AI Assist), preserving today's behaviour.
- "Inbox" demoted from top-level to the first row inside the Notes panel (it's a filter on Notes, not a separate destination).
- Notebooks tree + Tags tree move inside the Notes panel — they only make sense in the context of browsing notes.
- Specialised panel content where it earns its keep (Search: filters + saved searches + history; Tasks: Today/Upcoming/Overdue/By Project; AI Assist: conversation history).
- Keyboard shortcuts `⌘1`–`⌘9` jump between rail items.
- Mobile: rail collapses to a bottom tab bar; panel becomes full-width.
- Migration is **one big swap** of the sidebar component — no feature flag, no parallel paths. The existing routes, stores, and views are reused unchanged; only the navigation chrome around them is rebuilt.

### Non-Goals (v1)
- Drag-to-reorder rail icons (rail order is fixed in v1).
- User-customisable rail (hide/show icons) — defer until we know what people want pinned/unpinned.
- Multi-panel / split-panel layouts (e.g. Notes panel + Search panel side-by-side).
- Pop-out / tear-off panels.
- Resizing the rail width (fixed at 48px).
- Reskinning the editor area or top bar — this CR is strictly the left navigation chrome.

---

## 3. Approach

**Rail (~48px, fixed width):** ordered list of icon buttons. Active icon has a left accent stripe and a filled background. Hover shows a tooltip with the label and `⌘N` shortcut.

**Panel (~240px default, resizable 200–400px):** a single Vue component whose body is determined by the active rail item. Implemented as a `<component :is="activePanel" />` switch over a small map. The panel header shows the rail item's name and any panel-level actions (e.g. `+ New Note` in the Notes panel).

**Behaviour rules:**
- Clicking a route-target rail icon (Notes, Tasks, Search, etc.) updates the active rail item **and** pushes the corresponding route. The panel updates to match.
- Clicking a panel-toggle rail icon (Reminders, AI Assist) opens the existing popover/modal — does **not** change the active rail item or the panel. (These are "overlays," not destinations.)
- Routes drive rail state, not the other way around: navigating to `/tasks` from anywhere (a wikilink, a deep link, a back-button) sets the rail's active icon to Tasks.
- The panel is collapsible (a thin handle on its right edge or `⌘B` toggles it) for users who want maximum editor width. Rail stays visible.

---

## 4. Rail Inventory

Top group (primary destinations), in order:

| # | Icon | Label | Type | Today's route/behaviour | Shortcut |
|---|------|-------|------|--------------------------|----------|
| 1 | `FileText` | Notes | Route | `/notes` (also subsumes `/inbox`, `/notebooks/:id`, `/tags/:name`) | `⌘1` |
| 2 | `CheckSquare` | Tasks | Route | `/tasks` | `⌘2` |
| 3 | `Lightbulb` (with count badge) | Ideas | Route | `/ideas` | `⌘3` |
| 4 | `Bell` | Reminders | Panel toggle | Opens `RemindersPanel` popover | `⌘4` |
| 5 | `Search` | Search | Route | `/search` | `⌘5` |
| 6 | `Network` | Graph | Route | `/graph` | `⌘6` |
| 7 | `Sparkles` | AI Assist | Modal toggle | Opens AI Assist modal via `aiAssistStore.open()` | `⌘7` |
| 8 | `KeyRound` | Vault | Route | `/vault` | `⌘8` |

Bottom group (visually separated by a divider, pinned to rail bottom):

| Icon | Label | Type | Today's route |
|------|-------|------|---------------|
| `Trash2` | Trash | Route | `/trash` |
| `Settings` | Settings | Route | `/settings` |

**Note:** Inbox is intentionally removed from the rail — it's accessed as the first row of the Notes panel (see §5.1). This matches the reality that Inbox is just a filter (`is_inbox=true`) on the notes list.

---

## 5. Panel Content Per Rail Item

### 5.1 Notes panel (default landing)
The richest panel — combines what used to be sidebar navigation rows with the Notebooks and Tags trees.

```
┌─────────────────────────┐
│ Notes              [+ New Note ▾]
├─────────────────────────┤
│ 📥 Inbox             3  │   ← was a top-level item; now a filter row
│ 📄 All Notes            │
│ ★  Pinned               │
├─────────────────────────┤
│ NOTEBOOKS           [+] │
│ › E-Learning            │
│ ⌄ Projects              │
│   📁 Finance App     1  │
│   📁 Health App      3  │
│   …                     │
│ 📁 Travel            1  │
├─────────────────────────┤
│ TAGS                    │
│ › (collapsible)         │
└─────────────────────────┘
```

- Header has the `+ New Note ▾` button (with the split menu currently in the sidebar).
- Inbox / All Notes / Pinned are direct filter rows (same handlers `goToInbox()` / `selectAll()` use today).
- Notebooks tree: same component logic as today (stacks → notebooks, expand/collapse, drag-and-drop, context menu). Moved verbatim out of `AppSidebar.vue`.
- Tags tree: same as today.
- Default panel when the app first loads, when navigating to `/notes`, or when no rail item is active.

### 5.2 Tasks panel
Replaces today's "click Tasks → land on a page with no nav context":

```
┌─────────────────────────┐
│ Tasks      [+ New task] │
├─────────────────────────┤
│ VIEWS                   │
│ ● Today              5  │
│ ○ Upcoming          12  │
│ ○ Overdue            2  │
│ ○ No due date        8  │
│ ○ Completed             │
├─────────────────────────┤
│ BY PROJECT              │
│ • Noted App          4  │
│ • OCME App           3  │
│ …                       │
├─────────────────────────┤
│ TAGS                    │
│ # urgent             3  │
│ # waiting            5  │
└─────────────────────────┘
```

- View selection updates `tasksStore` filters and the main `/tasks` view renders accordingly.
- "By Project" groups by `notebook_id` of the linked note.
- "Tags" lists task-specific tags or shared tags filtered to tasks.

### 5.3 Search panel
Currently the weakest area — Search is one nav row that opens a page. The panel format gives it room to be useful:

```
┌─────────────────────────┐
│ Search                  │
├─────────────────────────┤
│ [ 🔍 Type to search… ]  │
├─────────────────────────┤
│ FILTERS                 │
│ ☐ Title only            │
│ ☐ In notebook…      ▾  │
│ ☐ Tagged…           ▾  │
│ ☐ Has attachment        │
│ ☐ Modified: any     ▾  │
├─────────────────────────┤
│ SAVED SEARCHES          │
│ ★ "auth refactor"       │
│ ★ "TODO" tag            │
├─────────────────────────┤
│ RECENT                  │
│ • migrations            │
│ • pgvector              │
│ • OCR pipeline          │
└─────────────────────────┘
```

- The input lives in the panel; the main view renders the results.
- "Recent" is a small local-storage list (last 10 unique queries). No backend change.
- "Saved searches" requires backend support — **scoped out of v1 acceptance** (the panel reserves the slot, but it's hidden until a follow-on CR implements persistence).

### 5.4 Graph panel
```
┌─────────────────────────┐
│ Graph                   │
├─────────────────────────┤
│ FILTERS                 │
│ ☐ Limit to notebook ▾  │
│ ☐ Tag…              ▾  │
│ ☐ Min connections: 1   │
├─────────────────────────┤
│ DISPLAY                 │
│ Depth:  [1] [2] [3]     │
│ Layout: force / radial  │
└─────────────────────────┘
```

Reuses the controls that today live as inline UI on `/graph` — moves them into the panel so the canvas gets full width.

### 5.5 Ideas panel
```
┌─────────────────────────┐
│ Ideas              [+]  │
├─────────────────────────┤
│ ● All                4  │
│ ○ Promoted              │
│ ○ Dismissed             │
├─────────────────────────┤
│ TAGS                    │
│ # idea               4  │
└─────────────────────────┘
```

Filter rows over the existing `/ideas` view.

### 5.6 Vault panel
```
┌─────────────────────────┐
│ Vault            [Lock] │
├─────────────────────────┤
│ ● All entries           │
│ ○ Logins                │
│ ○ Notes                 │
│ ○ Cards                 │
├─────────────────────────┤
│ TAGS                    │
│ # work                  │
│ # personal              │
└─────────────────────────┘
```

Filters by entry category. Lock button at top right.

### 5.7 Trash panel
```
┌─────────────────────────┐
│ Trash       [Empty all] │
├─────────────────────────┤
│ ● Notes              5  │
│ ○ Documents          0  │  (when CR025 ships)
│ ○ Tasks              1  │
│ ○ Ideas              0  │
├─────────────────────────┤
│ Auto-purge: 30 days     │
└─────────────────────────┘
```

### 5.8 Settings panel
```
┌─────────────────────────┐
│ Settings                │
├─────────────────────────┤
│ ● Appearance            │
│ ○ Account               │
│ ○ Integrations          │
│ ○ Vault                 │
│ ○ Backups               │
│ ○ System                │
│ ○ About                 │
└─────────────────────────┘
```

`SettingsView.vue` currently scrolls vertically through every section. This panel becomes the section navigator; the main view scrolls/jumps to the selected section. (Existing settings sections are unchanged — only the navigation pattern shifts.)

---

## 6. Component Architecture

New files:

| File | Purpose |
|------|---------|
| `frontend/src/components/sidebar/ActivityRail.vue` | The 48px icon rail. Owns active-item state, tooltips, badges, keyboard shortcuts. |
| `frontend/src/components/sidebar/ContextualPanel.vue` | Panel shell — header + body slot. Handles resize + collapse. |
| `frontend/src/components/sidebar/panels/NotesPanel.vue` | Inbox/All/Pinned rows + Notebooks tree + Tags tree (extracted from today's `AppSidebar.vue`). |
| `frontend/src/components/sidebar/panels/TasksPanel.vue` | Today/Upcoming/Overdue/By Project filter rows. |
| `frontend/src/components/sidebar/panels/SearchPanel.vue` | Search input, filter checkboxes, recent searches. |
| `frontend/src/components/sidebar/panels/GraphPanel.vue` | Graph filters and display controls. |
| `frontend/src/components/sidebar/panels/IdeasPanel.vue` | Ideas status filter rows. |
| `frontend/src/components/sidebar/panels/VaultPanel.vue` | Vault category filter rows. |
| `frontend/src/components/sidebar/panels/TrashPanel.vue` | Trash type filter rows. |
| `frontend/src/components/sidebar/panels/SettingsPanel.vue` | Settings section navigator. |

Modified:

| File | Change |
|------|--------|
| `frontend/src/components/sidebar/AppSidebar.vue` | Becomes a thin shell containing `<ActivityRail>` + `<ContextualPanel>`. Most of its current ~1,178 lines move into `NotesPanel.vue`. |
| `frontend/src/stores/ui.js` | Add `activeRailItem` (string) + `panelCollapsed` (bool) + setters. Persist in localStorage. |
| `frontend/src/router/index.js` | Add a route-meta hint (`rail: 'notes' \| 'tasks' \| …`) per route so the rail can derive active state from the current route. Default to `'notes'` for `/`, `/notes`, `/inbox`, `/notebooks/:id`, `/tags/:name`. |
| `frontend/src/views/SearchView.vue` | Remove the inline search input/filters (now in the panel). View renders results only, reads query from the route or store. |
| `frontend/src/views/GraphView.vue` | Remove inline filter controls (now in the panel). |
| `frontend/src/views/SettingsView.vue` | Add anchor IDs per section so the panel can scroll to them. Sections themselves unchanged. |
| `frontend/src/views/TasksView.vue` | Read filter state from `tasksStore` (driven by the Tasks panel). |
| `frontend/src/views/IdeasView.vue` | Same — read filter state from `ideasStore`. |
| `frontend/src/views/VaultView.vue` | Same — read category filter from `vaultStore`. |
| `frontend/src/views/TrashView.vue` | Same — read type filter from `trashStore` (or local state). |

Existing components reused unchanged: `RemindersPanel.vue`, `AIAssistPendingPill.vue`, all modals, all stores.

---

## 7. Routing & State

- **Rail active state is derived, not stored.** Each route declares its rail item via `route.meta.rail`. The rail component reads `useRoute().meta.rail` (with `'notes'` as the default) — no state-sync bugs possible.
- Reminders and AI Assist toggles do not change routes, so they have no `meta.rail` impact.
- `uiStore.panelCollapsed` persists across reloads (`localStorage`).
- Deep links continue to work: `/notebooks/abc-123` → router lands on `NotesView` → rail shows Notes active → Notes panel scrolls/expands to that notebook.

---

## 8. Keyboard Shortcuts

- `⌘1`–`⌘8` → jump to the corresponding rail item (Notes, Tasks, Ideas, Reminders, Search, Graph, AI Assist, Vault).
- `⌘B` → toggle panel collapsed/expanded.
- `⌘,` → Settings (preserves the existing convention).
- `Esc` while a panel-toggle item (Reminders, AI Assist) is open → close that overlay.
- Existing global shortcuts (`⌘K` palette, `⌘/Ctrl+Shift+A` for AI Assist, etc.) are unaffected.

Shortcuts are registered in a single `useRailShortcuts()` composable to keep them auditable.

---

## 9. Mobile / Narrow Width

- Below ~768px, the rail collapses into a **bottom tab bar** showing the same 8 primary items (bottom group items — Trash/Settings — move into an overflow `⋯` menu). This matches the iOS/Android pattern.
- The contextual panel becomes full-width and is shown only when a tab is tapped that has panel content; the editor/main view is reached via a back chevron.
- Today's `useMobile()` composable already distinguishes mobile state; the rail just renders a different template based on `isMobile`.

---

## 10. Migration / Compatibility

- **One big swap.** Old `AppSidebar.vue` is replaced wholesale. No feature flag — the new layout has full functional parity with the old one on day one, so there's nothing to A/B.
- **No backend changes.** All API and store contracts are preserved.
- **No data migration.** Sidebar state (which notebooks are expanded, etc.) is per-session UI state.
- **Visual regressions to watch:** the right edge of the panel will be a new visual boundary; ensure the editor area's left padding/border updates so there's no double-border. Theme variables in `theme.css` may need a new `--rail-bg` / `--rail-border` pair (or reuse existing sidebar tokens).

---

## 11. Acceptance Criteria

- [ ] `ActivityRail.vue` renders the 8 primary icons + 2 bottom-group icons in the order from §4, with the active icon visually distinguished.
- [ ] Tooltip on each rail icon shows the label and shortcut.
- [ ] Clicking a route-target rail icon navigates to the correct route and updates panel content.
- [ ] Clicking Reminders opens the existing `RemindersPanel` overlay without changing the active rail item.
- [ ] Clicking AI Assist opens the existing AI Assist modal without changing the active rail item.
- [ ] AI Assist pending-job pill continues to render on/near its rail icon.
- [ ] Ideas badge count renders on the Ideas rail icon when `ideasStore.pendingCount > 0`.
- [ ] `ContextualPanel.vue` renders the correct panel component for each active rail item.
- [ ] Notes panel contains Inbox / All Notes / Pinned rows + Notebooks tree + Tags tree, all with parity to the current sidebar's behaviour (expand/collapse, drag-and-drop, context menus, counts).
- [ ] Inbox is no longer a top-level rail icon; it's the first row inside the Notes panel and routes to `/inbox`.
- [ ] Tasks, Search, Graph, Ideas, Vault, Trash, Settings panels render their respective filter rows and drive the corresponding store/view filter state.
- [ ] Search panel's filters and recent-searches list drive `SearchView.vue` results; the in-view input is removed.
- [ ] Settings panel's section list jumps `SettingsView.vue` to the selected anchor.
- [ ] `⌘1`–`⌘8` shortcuts jump to the correct rail item; `⌘B` toggles the panel.
- [ ] `route.meta.rail` is set on every authenticated route; rail active state is derived from `useRoute().meta.rail`.
- [ ] Deep links (e.g. `/notebooks/:id`, `/tags/:name`, `/notes/:id`) land in the correct view with rail showing Notes active and Notes panel expanded to the relevant node.
- [ ] Panel collapsed state persists across reloads via `uiStore`.
- [ ] Mobile (<768px) renders a bottom tab bar with primary items; Trash + Settings live under an overflow menu.
- [ ] No backend API or migration changes shipped with this CR.
- [ ] Old `AppSidebar.vue` content fully removed (no dead code path); navigation chrome lives entirely in the new files from §6.
- [ ] All existing E2E flows pass: create note, edit note, drag-and-drop into a notebook, search, graph, tasks, ideas, vault unlock, trash restore, settings change.

---

## 12. Out of Scope (explicit)

- Drag-to-reorder rail icons.
- User-customisable rail (show/hide icons).
- Multi-panel / split-panel layouts.
- Pop-out / tear-off panels.
- Rail-width resizing.
- Reskinning the editor or top bar.
- Saved searches backend (Search panel reserves the slot; persistence is a follow-on CR).
- Per-rail-item badges beyond Ideas (Reminders due-count, Tasks overdue-count, etc. — can be follow-ons once the rail is in place).
- Adding new rail icons for features that don't exist yet (Library/CR025 will add its own rail icon as part of that CR, not this one).

---

## 13. Resolutions

Open questions from the proposal phase, with the agreed answers folded into the sections above:

1. **Default panel state on first load** → **expanded**. After the first interaction, `uiStore.panelCollapsed` persists the user's last choice in `localStorage`. Rationale: first-time users won't discover the panel content if the rail starts collapsed; the icon-only view is too non-obvious to be the default. See §3 and §7.
2. **Rail icon affordance for filtered Notes views** → **no affordance**. The active panel row (highlighted notebook/tag) and the editor's filter chip already make the active filter obvious. Adding a dot or sub-label on the rail icon would duplicate information already visible inches away and risk being misread as an unread/badge indicator. See §4 and §5.1.
3. **Help icon placement** → **dropped from the rail**. Help content (shortcuts, docs links, version) folds into a new "About / Help" section inside the Settings panel. The `⌘?` keyboard shortcut still opens a quick reference overlay. Help is not a daily destination and doesn't earn a permanent rail slot. See §4 and §5.8.
4. **Trash badge** → **no badge**. Items in trash are not an action item — auto-purge handles cleanup after 30 days. A count would create false urgency and train users to ignore badges. A "near auto-purge" indicator could be added in a follow-on CR if it ever proves useful. See §4.
5. **Theme tokens** → **new dedicated tokens** (`--rail-bg`, `--rail-border`, `--rail-active`, `--rail-hover`) added to `theme.css` across all three palettes (Sapphire / Dark / Light). The rail is tinted distinctly from the panel — the slight visual layering is what makes the pattern read as two surfaces instead of one tall sidebar. See §6 and §10.
