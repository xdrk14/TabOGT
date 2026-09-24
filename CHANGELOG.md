# Changelog

## 1.4.0 (2026-09-24)

### Centered layout, modelled on Tabisto (new default)
Researched first from tabisto.app (its product screenshots in the City, Aurora and Cosmos themes, and its customisation panel), the Chrome Web Store listing, Firefox Add-ons and the maker's write-up. TabOgt now uses the same structure:
- **Top bar:** a workspace pill on the left ("Personal ▾": switch, new workspace, workspace options), a wide search bar in the centre, compact tool buttons on the right.
- **Hero:** a large centred clock, then the date, then a time-of-day greeting ("Good evening."). A custom greeting in Customise → Header replaces it.
- **Cards:** centred, fixed-width, wrapping. Each has a small UPPERCASE label and a **list** of links: icon, title, and the site underneath. Every card has a "+ Add link" footer, and "+ New section" is a ghost card.
- **Workspace tabs** are hidden in this layout. While you drag anything, they float in at the top as drop targets, so drag-to-workspace still works.
- **Customise → Appearance → Layout** switches between **Centered** and **Board** (the previous layout). Existing setups move to Centered once, with the List view and 270 px cards. Board keeps whatever you had.

### Wallpapers with frosted cards
- **13 gradient wallpapers:** Aurora, Midnight, Dawn, Ink, Sand, Nebula, Lavender, Ember, Mint, Graphite, Ocean, Forest and Dusk. They are our own CSS; no images are bundled. The light ones are marked for the Light theme.
- **Photos:** **Upload image** (as before) or the new **Image from link**. Paste any image address, for example from Unsplash; it's checked to be a real image before it's used.
- **Choosing any wallpaper turns on Frosted cards automatically**, so the wallpaper shows through.
- **Tuning sliders** (Tabisto's set): **Card opacity**, **Blur intensity**, **Card radius**, **Grid spacing**, **Density** (scales the whole page) and **Glow** (a soft accent halo and top highlight on cards).
- The wallpaper's own sliders are now named **Wallpaper dim** and **Wallpaper blur**.

### Fixed: "Unchecked runtime.lastError: Cannot create item with duplicate id …"
When two right-click-menu rebuilds overlapped (startup plus a data change, or a restarted service worker), Brave logged a duplicate-id error for every menu item. Menu items are now created with a callback: a duplicate is updated in place (so renamed sections still show their new name) and nothing is logged. Each rebuild also waits for its items to finish before the next one starts.

### Tests
- 22 pass.
  - The existing tests pin the Board layout.
  - A new test covers the Centered layout: the pill switcher, greeting, list rows, "+ Add link", the floating workspace drop bar while dragging, gradient and link wallpapers with auto-frost, all six sliders and switching back to Board.
  - The migration test checks that a 1.0 setup lands on the Centered layout.

## 1.3.1 (2026-09-24)
- **Fixed: unreadable buttons with light accent colours.** Accent-filled buttons always drew white text, so with the White accent (and Yellow, Mint and so on) "Save page", "Organize", the active toolbar button and toast actions were blank.
  - TabOgt now computes two companion colours from any accent, including custom picks (`accentVars` in `store.js`):
    - **Text on accent buttons:** white where it's readable (as iOS does on blue, red, pink and purple), black otherwise (White, Yellow, Green, Mint, Cyan, Orange).
    - **Accent-coloured text and icons:** darkened on the Light theme, or lightened on Black/Dark, only when they would drop under 3:1 contrast. Standard accents keep their exact colour.
  - Applied on the dashboard, in the popup, and in the first-paint theme cache (`boot.js`).
- **Clearer button edges.** Accent-filled buttons get a hairline edge, so a White button still reads as a button on a white panel.
- **White swatch** in the colour picker now has an outline.
- **New test:** every preset accent plus a dark custom one, across Black, Dark and Light (39 combinations), measures real on-screen contrast of buttons, icons and accent text, plus the popup. 21 tests pass.

## 1.3.0 (2026-09-24)

### Drag and drop everywhere
- **Search results** can be dragged onto a section (dropped at the exact position), a workspace tab or "New section".
  - A link already on the board **moves**. A Library link or a typed address is **copied** onto the board, and the Library keeps it.
  - While you drag, the results list fades so the board underneath takes the drop.
  - A click still opens the link; middle-click opens it in a background tab.
- **Library panel folders** can be dragged onto a section (adds all links), a workspace tab or "New section" (each becomes a section named after the folder).
- **The Library button (and the open Library panel)** accept drops:
  - a tile moves into the Library
  - a whole section becomes a Library folder
  - links from pages, tabs and sessions are added (duplicates skipped)
- **Sessions:** drag a session card onto the board to add all its tabs. A single link inside it still drags on its own.
- **Open tabs:** drag a window's header ("This window (5)") to save every tab in it.
- **Workspace tabs** can be dragged to reorder them.

### Right-click menus
- **Search results:**
  - Open / new tab / new window / private, Copy link
  - for board links: Show on the board (switches workspace, scrolls and highlights the tile), Edit, Move to, Move to Library, Delete
  - for Library links: Add to the board, Add to section, Edit, Remove from Library
- **Library folders:** Add to the board, Add to workspace, Add links to section, Open all, Rename folder (subfolders follow), Remove.
- **Open tabs:** Switch to tab, Save to the board, Save to section, Save to Library, Copy link, Close tab. Window headers: save everything to a section, a new section or the Library.
- **Sessions:** Restore, Open here, Add as a section, Add to section, Save to Library, Rename, Delete.
- **Empty space on the dashboard:** New section, New workspace, Icons/List, Collapse/Expand all, Search, Library, Customise.
- **Tiles and sections:** new **Move to Library** option.
- Every "to section" menu lists the current workspace first, and offers a **New section** in each workspace.
- The edit dialog can move a bookmark into or out of the Library.

### Fixes found while testing
- **Stale results list:** the list is now closed by the drop itself. Because the browser reports the end of a drag late, the old "hide" could close a results list opened just after a drop.
- **Stuck results fade:** a very fast drop could leave the results list faded and unclickable (the fade was applied one frame after the drag had already ended). Fixed.
- **Refocus race:** the search box's "hide results on blur" timer no longer hides the list if you have refocused the box within 150 ms.

### Tests
- 20 pass, including one new test covering every drag path and menu above.

## 1.2.0 (2026-09-24)

### Sync through your own private GitHub repository (free)
- **Setup:** Customise → **Sync**. Enter `owner/repo` and a fine-grained token with "Contents: Read and write" on that one repository, then click **Connect**.
  - TabOgt keeps one file there, `tabogt-data.json`, holding your workspaces, sections, bookmarks, Library, sessions and settings.
  - The open workspace, wallpaper image and icon cache stay per laptop.
- **When it syncs:** a few seconds after any change (dashboard, popup, right-click menu or Alt+Shift+S), when a new tab opens (at most every 15 s), every 5 minutes, and at browser start.
- **Merging:** it's three-way, against the last synced copy, so edits made on two laptops combine instead of overwriting each other.
  - An add on one laptop and a delete on the other both apply.
  - Edits to different fields both survive.
  - An edit beats a delete.
  - Reordering is kept.
  - If both laptops write at the same moment, GitHub's version check rejects one; that laptop re-reads and merges again.
- **First connect on a laptop when the repository already has data:** choose **Use GitHub data** (recommended for a new laptop) or **Merge**. Merge joins same-named workspaces and sections and identical links.
- **Checks and errors:**
  - Before connecting, TabOgt checks the repository is reachable and warns if it's public.
  - Clear status messages cover an expired token, missing access, the rate limit and a missing repository.
  - Status and **Sync now** are shown in Customise. **Disconnect** keeps your data.
- **Token storage:** the token is stored only in `chrome.storage.local` (key `sync`). It is not in backups, exports or the synced file.
- **Code:** new file `sync.js` (merge plus the GitHub Contents API, including files over 1 MB). `background.js` schedules syncs. The manifest adds the `alarms` permission and host access to `api.github.com`.
- **Tests:** 19 pass. New tests cover the merge logic and a two-laptop run: two separate Brave profiles talking to a fake GitHub API. They check connect, the wrong-token and public-repo warnings, the second laptop pulling, simultaneous edits merging on both, settings syncing, an expired token and disconnect.

## 1.1.1 (2026-09-23)
- **Renamed to TabOgt everywhere.** This covers the extension name, toolbar tooltip, right-click menu, popup, messages, backup and export file names (`tabogt-backup-….json`), internal storage keys and the README. Because the internal keys changed, icons are re-cached once and the theme cache rebuilds on the first new tab. Your bookmarks are not affected.
- **New logo:** a white bookmark on a black rounded square. The source is `icons/icon.svg`, plus `icons/icon-small.svg`, a bolder version for 16 and 32 px. Regenerate the PNGs with `node tests/make-icons.cjs`.

## 1.1.0 (2026-09-23)

### Library: import as a list, search, add
- **Imports go to the Library, never the board.** Brave, CSV, HTML, Raindrop and `.txt` imports are all added as one flat list.
  - Duplicates are skipped and each bookmark keeps its original folder.
  - Nothing is rendered as tiles, so a big import doesn't slow down opening a new tab.
- **Search covers the board and the Library.** Library results show "Library › folder". Press **+** or **Alt+Enter** on one to add it to the section under the pointer. Once a link is on the board, it's listed only once.
- **Library panel** (new toolbar button, first on the left):
  - count, Organize, Import file, Import from Brave, Remove duplicates, Clear Library
  - per-folder "add as a section" and delete
- **Organize into a workspace** (in the Library panel, on the toast after every import, or type `>organize`):
  - Sorts the Library into topic sections (AI, Dev, Design, Video, Music, Social, News, Shopping, Finance, Learning, Work, Reference, Gaming, Travel, Health, Other), using known sites, then keywords, then the original folder.
  - Creates a new "Organized" workspace, removes duplicates and sorts each section A–Z. The Library itself is kept.
  - Libraries over 400 bookmarks open with sections collapsed.
  - Logic is in `organize.js`.
- **CSV import works with any CSV that has a URL column.** Raindrop, Pocket, Instapaper, Notion and spreadsheets all work.
  - Column names are matched loosely (url/link/href, title/name, folder/category/collection, tags/labels, note/description, created/date/time_added).
  - Separators can be commas, semicolons or tabs, and quoted fields are handled.
  - Files with no header row, and Unix timestamps, also work.
- `.tsv` and `.txt` (a list of links) are accepted too. HTML export and JSON backups include the Library.
- The popup's "Save to" and the right-click menu both have a **Library (search only)** option.

### Look: black themes, iOS style
- **Themes:**
  - **Black** (true OLED #000, the default)
  - **Dark** (iOS grouped grey)
  - **Light** (iOS light)
  - **Auto**
- **Accents:** the iOS system colours, plus a custom picker.
- **Redesign:**
  - system font (SF Pro on Mac, Segoe UI Variable on Windows)
  - solid surfaces by default ("Frosted" is optional)
  - segmented controls for workspaces and settings
  - iOS switches and grouped-list settings
  - app-icon squircle tiles and iOS-style context menus (icons on the right)
  - capsule toasts
- **Removed:** the neon glows, gradient section tints and purple "aurora" wallpapers. Wallpaper now defaults to None; the calmer presets are optional.
- The popup follows the theme.
- **Existing setups migrate once.** Untouched defaults move to the new look (dark → Black, aurora → None, old pastel section colours → iOS colours). Custom choices are kept.

### Speed
- **Icons are cached on this computer** (IndexedDB, small PNGs). Real icons are stored per site; "no icon" results are stored per page and re-checked daily. After the first view, every tile paints from the cache with no `_favicon` request. Customise → Behaviour → **Refresh icons** clears it.
- **Faster start.** The first paint uses the right theme immediately (`boot.js`), with no flash. Data, wallpaper and the icon cache load in parallel, and the Open tabs list loads when idle.

### Tests
- 17 tests pass in Brave. New tests cover the Library, every import format, Organize, the migration and the icon cache. New screenshots: `organized.png` and `library-panel.png`.

## 1.0.1 (2026-09-23)

A review-and-fix release. No visual redesign. Every fix below is covered by `tests/smoke.spec.js`
(16 tests, all passing in Brave), except where "Not verified" says otherwise.

### Critical

| File | What | Why |
|---|---|---|
| `newtab.css`, `popup.css` | Added `[hidden] { display: none !important; }` | `.modal { display: grid }` and `.drawer { display: flex }` overrode the `hidden` attribute. An empty dark overlay covered the whole dashboard, an empty drawer sat on the right, and the popup always showed the "New section name" field. Confirmed in a screenshot before the fix. |
| `store.js` | New `update(fn)`: reads fresh data, applies the change and saves, all under a Web Lock (`navigator.locks`, name `tabogt-data`). `save()` now takes the same lock. | Every page used to write its whole in-memory copy, so the last writer won. |
| `popup.js` | Save page, Save all tabs and Save as session now go through `update()`. The chosen section is re-resolved in the fresh data (with a fallback if it was deleted). A `busy` guard allows one write per popup. | A popup left open while you edited the dashboard wrote its stale copy back and wiped your edits. A double click or a repeated Enter saved twice. |
| `background.js` | Context-menu saves and Alt+Shift+S go through `update()`. | Two quick saves both read the same data and one was lost. The test now fires five at once and checks that all five land. |
| `newtab.js` | Undo is dropped when another page writes (`dropUndo()`), and only the newest toast keeps an Undo button. | Undo restores a whole snapshot. An older Undo, or any Undo after a popup/quick-save/other-tab write, silently reverted those later changes. |
| `newtab.js` | The edit dialog, Delete, tile menus and keys, and Notes all resolve the bookmark or workspace **by id** when they act. A sync from another page closes any open menu. Notes are not re-rendered while you're typing in them. | After a sync replaced the data, these acted on the old copy. Edits were dropped silently while the toast still said "Deleted…". |

### High

| File | What | Why |
|---|---|---|
| `newtab.js`, `newtab.css` | Section drag: dropping on the right half of a section places it **after** (new `.sec-drop-after` marker). | Sections could never be dragged into the last position. |
| `newtab.js` | CSV import: missing columns in a row are treated as empty. | A short Raindrop row crashed on `r[ci.tags].split` and aborted the whole import. |
| `popup.js` | Enter ignored on focused buttons and during IME composition. | Enter on "Save all tabs" or "Open dashboard" ran "Save page" instead. |
| `newtab.js` | Pending Notes and Customise changes are flushed on `pagehide` / `visibilitychange`, using the unlocked `write()`. | Text typed within 350 ms of closing the tab was lost. |
| `newtab.js` | Guards on `indexOf(...) === -1` for delete section, move section and delete workspace. | `splice(-1, 1)` would have removed the **last** section. |

### Medium: performance and robustness

Measured on the test data (3,000 bookmarks in 60 sections, one workspace), with Brave headless on Intel UHD graphics:

| Metric | Before | After |
|---|---|---|
| One change (for example, collapse), to the next painted frame | ~1,500 ms | ~430–590 ms |
| JavaScript part of that | ~370–600 ms | ~80 ms |
| `dragover` handler | 8.8 ms per event | 0.24–0.39 ms |
| Search | ~80 ms | ~40–55 ms |
| Event listeners and nodes after 20 re-renders | flat | flat (no leak) |

| File | What | Why |
|---|---|---|
| `newtab.js` | Tile elements are reused when the bookmark is unchanged (keyed by id and a content signature); their handlers look the bookmark up by id. The cache is pruned on each render. | Rebuilding about 27,000 nodes on every change was the main cost. |
| `newtab.css` | `.sec { content-visibility: auto; contain-intrinsic-size: auto 300px; }` | Off-screen sections skip layout, paint and their backdrop blur. A change's frame dropped from about 1.2 s to about 0.47 s in an A/B run. |
| `newtab.js` | `dragover` measures first and only touches classes when the insertion point changes. | Each event used to clear marks across the document and force a layout. |
| `newtab.js` | Tiles skip building their hidden children: host and tags in grid view, and all tiles in collapsed sections. | Fewer nodes per render. |
| `newtab.js` | `<img>` gets `loading="lazy"` before `src`, plus `decoding="async"`. | Attribute order meant icon fetches could start before lazy loading applied. |
| `store.js` | `favicon()` builds its URL with a string instead of a `URL` object. | Called once per tile per render. |
| `newtab.js` | The wallpaper style is only re-applied when it changes; `filter` is `none` when wallpaper blur is 0. | Every change re-assigned a multi-MB data URL. |
| `newtab.js`, `store.js` | The Open tabs panel checks "already saved" against a Set built once (`urlKey` exported from `store.js`). | It had run tabs × bookmarks comparisons on each re-render. |
| `store.js` | `normalizeData` validates backups: drops items with no URL or with `javascript:`/`data:` URLs, turns string tags into a list, and resets invalid colours (`accent`, `wallColor`, section colour) to defaults. | Hand-edited or foreign backups could inject bad URLs or CSS text. |
| `newtab.js` | Letter fallback for Brave icons: each `_favicon` icon is compared byte-for-byte against Brave's generic globe (one check per icon URL, shared while in flight). If it matches, the coloured letter is shown instead. | `_favicon` answers unknown sites with a globe and HTTP 200, so the old `error` fallback never fired. Confirmed with a probe: the globe and real icons are both `200 image/bmp`. |
| `newtab.js` | Unsupported wallpaper images (such as HEIC) show a toast. Confirm and prompt dialogs settle when dismissed with Esc or a backdrop click. | These used to fail silently, and the promises never resolved. |

### Low: accessibility and polish

- **`newtab.js`, focus after changes:** keyboard focus is restored after every re-render: to the same tile, else its neighbour, else the section's first button. Delete, collapse and so on no longer drop focus to `<body>`.
- **`newtab.js`, menus:** focus returns to the element that opened the menu. Home and End keys added.
- **`newtab.js`, dialogs:** focus is trapped with Tab and returns to the opener; the dialog gets an `aria-label` from its heading.
- **`newtab.js`, `newtab.html`, ARIA:**
  - Workspace tabs have `aria-selected`.
  - The search box has `role=combobox`, `aria-expanded` and `aria-activedescendant`, and its results have `aria-selected`.
  - Rows in the Open tabs panel are focusable and open with Enter.
- **`newtab.js`, reduced motion:** `startRenameById` uses `behavior: auto` when reduced motion is requested.
- **`newtab.js`, `popup.js`, IME:** Enter no longer fires while an IME is composing (search, dialogs, renames, add-link row, popup).
- **`newtab.css`, focus outline:** focused tiles had a double outline; now only the icon plate is outlined.
- **`newtab.css`, letter size:** the letter fallback is sized correctly in search results and the Open tabs panel.
- **`newtab.css`, light-mode colours:** search match highlights and list-view tags use a darker accent in light mode. The pastel accent was nearly invisible on light glass ("Alpha" rendered as "lph").
- **`popup.css`, fonts:** two invalid `font: … inherit` rules replaced with longhand properties. The popup title is bold again.
- **`popup.js`, icon fallback:** the popup falls back to the extension icon if the favicon fails.
- **`newtab.html`, file input:** `#fileIn` gets `accept=".json,.html,.htm,.csv"`.
- **`background.js`, test hook:** named handlers are exposed as `globalThis.tabogtTest` so the tests can drive the real context-menu and shortcut handlers. They are harmless in normal use.
- **`manifest.json`, versions:** `version` 1.0.1; `minimum_chrome_version` 111 (for `color-mix()`; `_favicon` needs 104).

## Tests

`tests/smoke.spec.js` (Playwright) loads the unpacked extension into a throwaway profile in **your installed Brave**. Playwright's bundled Chromium failed to start on this PC (Windows side-by-side assembly error). Set `TABOGT_BROWSER` to use another Chromium build.

```
cd tests
npm install
npx playwright test          # headless
set GPU=1 && npx playwright test   # use the graphics card (closer to real performance)
set HEADED=1 && npx playwright test # watch it run
```

Screenshots (1440 and 800 wide, dark and light, plus the popup, menu, search, Customise, favicons and the 3,000-bookmark board) and `perf.json` are written to `tests/screenshots/`.

## Could not be verified automatically (simulated or skipped)

- **Dragging links from other pages, the address-bar icon and multi-URL drops:** simulated by dispatching real `DragEvent`s with the same `text/uri-list` / `text/html` / `text/plain` data Brave provides. Playwright cannot start an OS-level drag from outside the page. Drags inside the page (tiles, sections, Open tabs rows) use real mouse drags.
- **Paste:** a dispatched `ClipboardEvent` rather than the OS clipboard.
- **Context-menu clicks and Alt+Shift+S / Alt+Shift+D:** the real handlers are called through `tabogtTest`. Menu **existence** after rebuilds is checked with `chrome.contextMenus.update`. The native menu and keyboard shortcuts themselves were not exercised.
- **Import from Brave:** the optional-permission prompt can't be clicked by automation, so `chrome.permissions.request` and `chrome.bookmarks.getTree` are stubbed with a realistic tree. The walking and grouping code is real.
- **"Open in private window":** needs "Allow in private" and was not exercised.
- **The popup:** tested as a tab (`popup.html` loaded behind the page it saves), not in the toolbar bubble. Its `window.close()` is not asserted.
- **Scroll smoothness:** headless frame pacing is throttled (about 100 ms frames regardless of settings), so scroll numbers are reported in `perf.json` but not asserted. With the GPU, per-section `backdrop-filter` still costs about 3× on scroll (about 80 ms vs 25 ms per frame with blur off). `content-visibility` limits it to on-screen sections. Removing the blur would change the design, so it was left as is. Lowering Customise → Frost blur is the user-side lever.
- **The race between two dashboards saving at the exact same millisecond:** still last-write-wins. The dashboard keeps a synced in-memory copy rather than re-reading before each change. Popup and background writes are fully protected.
- **Context-menu titles with `&`:** left unchanged. Chromium already escapes ampersands in extension menu titles, but this was not checked on screen.
- **Badge "✓" after a quick-save:** cleared with `setTimeout` in the service worker, which could in theory be stopped first. Not changed.

## Observations, not changed (design decisions for you)

- **Light theme on a dark wallpaper:** the Light theme on the default dark Aurora wallpaper turns the page muddy grey. Loose text (the hint line, the "New section" label, counts) becomes hard to read. The Dawn wallpaper suits the Light theme. Consider switching the wallpaper automatically with the theme.
- **Drawer covers the toolbar:** when a panel is open, the drawer covers the toolbar buttons, so switching panels needs Esc or × first.
- **Switching workspaces in all tabs:** switching workspace in one new tab switches all open new tabs (the active workspace is saved with the rest of the data).
- **The popup:** it is always dark and ignores the Light theme.
- **Backups:** they don't include the uploaded wallpaper.
- **Importing from Brave twice:** creates two copies.
- **Packaging:** `tests/` (with its `node_modules`) sits inside the extension folder. Brave loads it fine, but leave it out if you ever zip the extension.
