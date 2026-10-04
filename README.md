# NoteFlow — Offline-First Notes App

> **ALGOTHON'26** · Problem Statement **ALG-WEB-02 — Offline-First Application**

A notes web app that keeps working when the internet doesn't. Every edit is saved on the
device instantly, queued as **pending**, and synced to a server when the connection returns —
with a visible sync status and **real conflict handling** (it asks, it never silently overwrites).

---

## The Problem

Most web apps assume "always online". When the signal drops — in a village, on a train, in a
basement, on patchy mobile data — the app breaks, and the user loses work. ALG-WEB-02 asks for an
app that stays **useful offline** and **synchronises safely** when connectivity returns, without
silently discarding data.

## Our Solution

NoteFlow flips the usual model: **the device is the source of truth, the server is the sync layer.**

- Write, edit, pin, categorise and delete notes with **zero internet**.
- Changes are stored locally and marked **pending** until they reach the server.
- When the connection returns, queued changes **sync automatically** (or on demand).
- If the same note was changed elsewhere, the app **detects the conflict and asks the user** —
  it never overwrites silently.
- Attachments (images/files) are stored in **IndexedDB**, so large files never bloat the notes store.

## Live Demo

- **Live app:** `<your deployed URL — e.g. https://noteflow-xyz.onrender.com>`
- **Demo video:** `<your video link>`
- **Repository:** `<your GitHub URL>`

## Feature Checklist (the 6 required must-haves)

| # | Requirement | How NoteFlow delivers it |
|---|-------------|--------------------------|
| 1 | **Offline cache** | Notes persist in `localStorage`; attachment blobs persist in `IndexedDB`. Data survives reloads and restarts with no connection. |
| 2 | **Offline CRUD** | Create, read, update, pin, categorise and delete notes entirely offline. |
| 3 | **Pending changes** | Offline edits are queued and counted — a live **"N pending"** badge plus a per-note **PENDING** tag. |
| 4 | **Connectivity detection** | Live **Online / Offline** state from `navigator.onLine` and the browser's `online`/`offline` events, with a "Simulate offline" toggle for demos. |
| 5 | **Synchronisation** | Queued changes are pushed to the backend (`PUT /api/notes`) on reconnect; the server's notes are pulled and merged on load (`GET /api/notes`). |
| 6 | **Sync status** | Per-note status tags, a status bar with last-synced time, queued count, and an activity ticker. |

**Plus the bonus: conflict handling.** When two devices edit the same note offline, the app detects
it on sync and presents a **"Keep my version / Keep the other version"** choice — nothing is
overwritten silently.

## How It Works

```
        ┌──────────────┐   offline edit    ┌───────────────────┐
        │   Browser    │ ────────────────► │ localStorage      │  notes (metadata)
        │  (NoteFlow)  │                   │ IndexedDB         │  attachments (blobs)
        └──────┬───────┘                   └───────────────────┘
               │  online?  (navigator.onLine)
               ▼
        ┌──────────────┐   GET / PUT       ┌───────────────────┐
        │  server.js   │ ◄───────────────► │  data/notes.json  │
        │ (Node HTTP)  │                   │  (server storage) │
        └──────────────┘                   └───────────────────┘
```

**The sync flow, step by step:**

1. **Offline edit** → saved to `localStorage` immediately, note flagged `pending`.
2. **Connectivity returns** → the app detects it and pushes queued notes to the server.
3. **Success** → notes are marked synced and `lastSync` updates. If the server is unreachable,
   the app stays **offline-only** and says so — it never pretends to have synced.
4. **Conflict** → if a note was also changed elsewhere, the app blocks the sync and asks the user
   which version to keep.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Markup | HTML5 (semantic, accessible) |
| Styling | Tailwind CSS (CDN) + a small custom `styles.css` |
| Logic | Vanilla JavaScript (no framework) |
| Offline data | `localStorage` (notes) + **IndexedDB** (attachments) |
| Backend | Node.js core `http` module (no dependencies) |
| Storage (server) | JSON file (`data/notes.json`) written atomically |

## Project Structure

```
.
├── noteflow.html     # The app shell (markup only)
├── noteflow.js       # All app logic: offline-first engine, sync, conflict handling
├── styles.css        # Custom CSS (Tailwind handles the rest, via CDN)
├── server.js         # Node backend: serves the app + /api/notes (GET/PUT)
└── data/
    └── notes.json    # Server-side notes (created on first save)
```

## Running Locally

**Requirements:** Node.js 18+ (only for the backend). No build step, no npm install.

```bash
# 1. Start the backend (serves the app AND the API)
node server.js

# 2. Open the app
#    http://127.0.0.1:3000
```

Opening `noteflow.html` directly (as a `file://` page) also works — the app then runs in
**offline-only** mode (no server sync), which is the graceful fallback, not a failure.

## Deployment

The backend is a plain Node HTTP server, so it deploys anywhere:

1. Push this repo to GitHub.
2. Deploy to a Node host (e.g. **Render**, **Railway**, **Fly.io**) — start command: `node server.js`.
3. The frontend calls the API with a **relative** path (`/api/notes`), so it works on any host
   without configuration.
4. Use the deployed URL as the live demo link.

> For a **fully offline** build (no CDN), compile Tailwind to a local CSS file and link it instead
> of the CDN. The custom CSS is already external in `styles.css`.

## Accessibility

- Semantic landmarks (`header`, `main`, `section`, `ul`/`li`), a single `h1`, and a skip link.
- `sr-only` labels on inputs; `aria-label` on every icon-only button; decorative SVGs `aria-hidden`.
- Live regions: connection status, activity ticker and toasts use `role="status"` / `aria-live`;
  the conflict card uses `role="alert"`; a hidden region announces sync and conflict events.
- State exposed correctly: `aria-pressed` (pin), `aria-current` (active note), `role="switch"` (toggle).
- Full keyboard operability, visible `:focus-visible` rings, and `prefers-reduced-motion` support.

## SEO

Descriptive `<title>` and meta description, keywords, author, robots, canonical, `theme-color`,
**Open Graph** and **Twitter card** tags, and **JSON-LD** structured data (`WebApplication`).

## Testing / Verification

- JavaScript syntax validated with `node --check` on `noteflow.js` and `server.js`.
- Backend verified end-to-end: `GET /noteflow.html`, `/noteflow.js`, `/styles.css` → `200`;
  `GET` and `PUT /api/notes` → `200`.
- Full integration verified in a headless browser served by `server.js`: the page boots, renders
  notes, and reaches the backend.
- Conflict flow verified: simulating a conflict then syncing **does not switch notes** and shows
  the conflict card when the note is opened.

## Known Limitations

- **Server storage is a single JSON file** — fine for a prototype; a real deployment would use a database.
- **Tailwind loads from the CDN**, so the app needs internet *once* to style itself (see Deployment for the offline build).
- **Sync requires the backend**; without it the app is deliberately offline-only and says so.
- Conflict detection compares note versions on sync; it is intentionally simple (keep-mine / keep-theirs).

## AI Assistance Disclosure

AI-assisted development tools were used during this project (as permitted by the event rules).
All code was reviewed, integrated and tested by the team, and the app's behaviour was verified
end-to-end. No third-party code was copied without attribution.

## Team

- `<Your Name>` — `<role>`
- `<Teammate>` — `<role>`

## Acknowledgements

- Problem statement: **ALGOTHON'26 — ALG-WEB-02 (Offline-First Application)**
- Tailwind CSS, and the open web platform (`localStorage`, `IndexedDB`, Service-Worker-era APIs)
