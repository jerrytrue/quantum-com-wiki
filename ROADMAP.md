# Quantum Tech Wiki — Roadmap

Tracks planned work across multiple rounds. Each round is one scheduled-task batch.

## Round 1 — Foundation ✅ (merged 2026-06-03)

- Reset icon ↺ in filter header (hover tooltip "Reset" / "重設")
- Sidebar + RSS strip fixed-position with internal scrollbars
- Live stock prices for 9 public vendors (Yahoo Finance via CORS proxy)
- New vendors: D-Wave (QBTS), Quantum Computing Inc (QUBT). Total 30.
- `.github/ISSUE_TEMPLATE/update-vendor.yml` community submission form

## Round 1.1 — Polish (merged 2026-06-03)

- **RSS strip carousel** (PR #2): 3 items per page, 5s auto-rotate, hover-pause, ◀ ▶ nav. Strip moved to `left: 280px` so it no longer overlaps the filter column. Sidebar gets full viewport height.
- **Trading status + Founded era filters** (PR #3): Public/Private toggle (8/22), legacy/modern/recent buckets (6/10/14). Derived from existing fields, no schema change.

## Round 2 — Physics deep-dive ✅ (pushed 2026-06-04, manual run)

Scheduled task fired 2026-06-03 19:00 but the host app closed shortly after,
so the agent only logged ~1 minute before dying. Re-executed manually inside
the chat session on 2026-06-04 morning. Five commits on `round2-improvements`:

- `physics-details.json` — 7 physics technologies × {principle, encoding, pros, cons, players, operating temp, T₂} in EN + ZH
- `svg/*.svg` — 7 schematic diagrams (one per physics)
- Click physics chip → opens modal with text + SVG + 3-row layout
- Interactive Bloch sphere in modal (three.js r128): X / Y / Z / H / S / T gates + Reset + live |ψ⟩ + ⟨σ⟩ display
- One follow-up fix for a dead-code syntax error in bloch.js

## Round 3 — Backlog (not scheduled yet)

### Tier 2: more filter dimensions (needs new vendors.json fields)

- **☁️ Cloud platform availability** (`clouds: []` array on each vendor)
  - Buckets: AWS Braket / Azure Quantum / Google Cloud Quantum / IBM Cloud / proprietary / on-premise only
  - Source: official vendor docs as of mid-2026; revisit per release notes
- **🌡 Operating temperature** (`operatingTemp` enum)
  - Buckets: room temp / mild cryo (~K) / dilution (~mK) / not applicable
  - Already drafted in Round 2 prompt — can reuse those values
- **🔢 Qubit count scale** (`qubitCount` integer + `qubitCountTier` derived)
  - Buckets: <50 / 50–500 / 500–5,000 / 5,000+
  - For analog systems (annealers, neutral atom analog) use atom/spin count
- **🎯 Application focus** (`applications: []` array)
  - Buckets: Chemistry / Optimization / ML / Finance / Cryptography / FTQC research / Sensing
  - Multi-select on each vendor

### Tier 3: filter UX overhaul

- **Collapsible filter sections** — each `<h3>` gets a chevron, click to collapse. Default state: physics + stack expanded, others collapsed. Persist per-section state to localStorage.
- **Filter presets / quick chips** — row of chips above the search box: "All public stocks" / "Full-stack only" / "Neutral atom" / "Pre-2010 incumbents" etc. One click applies the preset combo. Editable presets stored in localStorage.
- **Compare mode** — checkbox on each card (small ☑ icon top-right next to stack chips). Pick 2–4 vendors → "Compare" button appears bottom-right → opens a side drawer with parallel columns of all the vendor fields (physics, stack, milestone, stock, etc.). Esc / click outside to close.

### Bugs / polish to fix when convenient

- **Stock column overflow in table view** — the Stock column is `width: 6%` (~37px) but the stock chip text like `GOOGL $310.15 -1.23%` is ~110px and `white-space: nowrap`, so the chip visibly bleeds into the Founded column on rows with high-priced or wide-ticker vendors. Fix: rebalance column widths to give Stock ~12%, taking from Milestone (20→16%) or Stack (17→14%). Will need a re-screenshot pass at narrow viewport widths to confirm nothing else regresses.

### Other ideas parked here for future rounds

- "Recently active" filter — vendors with news in last 7 days (uses RSS data)
- Per-physics article link out to Wikipedia/arXiv survey
- Light-mode redesign pass (current dark mode is primary, light is functional but unloved)
- Mobile layout review

---

## How to use this file

When starting work on a new round, read this file first. Move items from "Backlog" up into a new "Round N — …" section as they get scheduled. Mark with status emoji:

- ⏰ scheduled (with date)
- 🚧 in progress
- ✅ merged (with date)
- ⏸️ paused (with reason)

Keep the file under ~200 lines — once a round is well past, condense it to a 1–2 line summary.
