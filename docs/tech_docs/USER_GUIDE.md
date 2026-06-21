# ClaudeWatch — User Guide

> A guide for anyone who uses Claude Code and wants to *see* what their agent did. No
> coding or knowledge of the ClaudeWatch codebase required. (Developers: see
> [`DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md).)

---

## 1. What is ClaudeWatch?

When you run Claude Code, the agent thinks in steps: it reads your prompt, decides what to
do, runs tools (reading files, running commands, editing code), sometimes spins up helper
"subagents," and eventually finishes. Normally all of that scrolls past as text.

**ClaudeWatch turns that reasoning into a map.** Each step the agent took becomes a node —
a **Thought** — and lines connect each Thought to the ones that followed it. A glowing dot
(the *playhead*) then retraces the agent's path, lighting up the trail as it goes, like a
light-cycle in TRON. You watch the reasoning unfold instead of reading a transcript.

It works on the sessions you've **already run** — ClaudeWatch reads Claude Code's own logs
from your computer. You don't have to record anything or change how you use Claude Code.

---

## 2. Getting started

1. Open a terminal in the ClaudeWatch folder.
2. Run:
   ```bash
   npm install   # first time only
   npm run dev
   ```
3. Open the link it prints — **http://localhost:5173** — in Chrome or Edge.

You'll see a dark canvas with a list of your sessions on the left. Click any session and
its graph appears and starts playing.

> ClaudeWatch reads from where Claude Code stores its logs on your machine
> (`~/.claude/projects`). If you've used Claude Code, your sessions show up automatically.

---

## 3. Reading the graph

The graph is read **top to bottom**: the prompt is at the top, and the agent's work flows
downward. Each node is one Thought, and each shape tells you what kind of step it was:

| Shape | Glyph | What it is |
|---|---|---|
| Chevron (arrow) | `>` | Your prompt, or a follow-up message you sent |
| Rounded box | `·` | The agent thinking / deciding (text, no action) |
| Octagon | `⚙` | A tool call — reading a file, running a command, editing code |
| Parallelogram | `⌥` | The agent spawning a **subagent** (a helper task) |
| Hexagon | `■` | The session finishing |

### The colors

Colors tell you the *state* of each Thought:

| Color | Meaning |
|---|---|
| **Dim teal** | Not reached yet (idle) |
| **Bright cyan** | The playhead — where the agent is *right now* in playback |
| **Aquamarine green** | On the winning path that solved the task (shown once playback finishes) |
| **Red-orange** | A step that failed (a command errored, a file wasn't found) |
| **Very dark / faded** | A dead-end branch that got abandoned (called *pruned*) |
| **Violet/purple** | Anything belonging to a **subagent** (helper task) |

So at a glance: green is the path that worked, red is where something broke, violet is a
helper's work, and faded means "the agent tried this and moved on." The **Legend** at the
bottom-left of the canvas shows these colors any time you need a reminder.

---

## 4. Playing back a session

When you open a session it starts playing automatically. The controls sit at the
bottom-center of the screen:

- **▶ / ❚❚** — play or pause.
- **‹ ›** — step back / forward one Thought at a time (handy when paused).
- **The scrubber bar** — drag it to jump to any point in the session.
- **Jump buttons** — skip straight to the next **subagent** (`⌥`), the next **tool call**
  (`⚙`), or the next **failure** (`⊘`). Great for finding "where did it go wrong?" fast.
- **■** — jump to the end.
- **↺** — restart from the top.

You can also change the **speed**. And a few keyboard shortcuts make playback quicker:

| Key | Does |
|---|---|
| `Space` | Play / pause |
| `→` / `←` | Step forward / back |
| `F` | Fit the whole graph on screen |
| `L` | Toggle FOLLOW mode (see below) |
| `\` | Hide / show the left sidebar |
| `Esc` | Close the detail panel |

As playback runs, a small readout near the bottom (the **HUD**) types out what the agent is
doing on each step and what the result was — e.g. `Bash: npm test` followed by
`exit 0 — 12 passed`. When the agent is inside a subagent, this readout gets a violet
frame.

---

## 5. Moving around the canvas

- **Pan:** click and drag the empty canvas.
- **Zoom:** scroll the mouse wheel.
- **FOLLOW mode:** the camera automatically follows the playhead, keeping it in view with
  the upcoming steps below it. This is on by default. Pan or zoom yourself and it switches
  off (so you stay where you put it); press `L` or the **FOLLOW** button to turn it back on.
- **FIT:** press `F` or the **FIT** button to zoom out and see the whole graph at once.
- **Minimap:** the small map in the bottom-right shows the entire graph with a box marking
  what you're looking at. Click anywhere on it to jump there, or drag the box to move
  around.
- **Detail panel:** click any node to pin it open in a panel on the right, showing the full
  text of that Thought — the whole prompt, the command that ran, the tool output, token
  usage, and so on. Press `Esc` or the `×` to close it. (Just hovering a node gives you a
  quick tooltip without pinning.)

There are also a few **filter toggles** (top-left) to declutter a busy graph: hide pruned
(dead-end) branches, hide subagents, or show only the winning path.

---

## 6. The left panel

The sidebar on the left is your library. A dropdown at the top switches it between three
modes:

- **SESSIONS** — all your sessions, grouped by project. This is the default. You can:
  - **Rename** a session by double-clicking its title.
  - Spot **live** sessions by the pulsing `● LIVE` tag (see §7).
  - **Search** with the filter box, **collapse** project groups, and **reorder** them by
    dragging.
- **PROMPTS** — every individual prompt you've ever sent, newest first. Click one and
  ClaudeWatch shows *just that prompt's* slice of the session — the work between that
  prompt and your next message — instead of the whole session. Useful when one session had
  many separate requests.
- **USAGE** — opens the Token Usage page (see §10).

You can collapse the whole sidebar (the `\` key, or its collapse button) to give the graph
more room, and drag its edge to resize it.

---

## 7. Watching live sessions

ClaudeWatch can show a session **as it happens**. If you have Claude Code running in
another window, that session shows a pulsing **`● LIVE`** tag in the sidebar within a few
seconds.

Open a live session and ClaudeWatch switches to a **multi-pane view**:

- One pane for the **main agent**, updating in real time as it works.
- A **separate pane for each subagent** the agent spawns, so you can watch helpers run in
  parallel.

When a subagent finishes its work, its pane starts a countdown — **`CLOSING IN 30s`** — and
then disappears to keep the view tidy. If you want to keep it around:

- **Hover** the countdown — it changes to **`STOP CLOSING`**.
- **Click** it — the pane **freezes** and stops counting down. Click again to resume.

The main session keeps its `● LIVE` tag until it's been idle for a few minutes. You can
leave the live view at any time by toggling the **LIVE** button in the top-right.

---

## 8. Logical Steps

The **Logical Steps** tab in the right inspector gives you a plain-language story of what
the agent did — a handful of high-level phase blocks such as *Explore the codebase →
Decide on the approach → Implement the change → Verify the result* — sitting alongside the
graph. It's meant for when you want the gist of a session without reading every tool call.

**It's off by default.** Clicking the *Logical Steps* tab shows an *Enable* prompt
explaining that ClaudeWatch will run a local `claude -p` narrator and draw on your Claude
subscription. Nothing happens until you click enable, and enabling is per-session — a
different session will show the prompt again.

**Verbosity.** A three-level toggle adjusts how much detail you see:

- **Overview** — collapses related blocks into coarse phases; fewest entries.
- **Steps** — shows each individual logical block (the default).
- **Detailed** — expands every block to show a longer description.

Switching levels is instant and costs nothing — no model call is made. The blocks stay the
same; only what's shown changes.

**Refresh.** Click **⟳ Refresh** for a fresh, more thorough Sonnet-powered rebuild of the
whole narrative from scratch. Useful when you want a better-worded summary after the
session is complete. The Armillary loader animates while it runs.

**Two-way sync.** The active block highlights as the graph playhead moves through the
session. Click a block to jump the graph to the first Thought that block covers.

---

## 9. The Memory page

Choose **MEMORY** in the sidebar dropdown to browse, read, and edit the memory store that
Claude Code keeps about your projects. ClaudeWatch shows all your memories — both the
global ones (shared across every project) and the per-project ones — in one place.

### Browsing memories

The sidebar groups memories by scope: **GLOBAL** first, then one group per project. Each
item shows a color-coded type badge — **feedback** (amber), **project** (cyan),
**reference** (violet), **user** (green) — followed by the memory's slug name. Use the
filter box at the top of the sidebar to search by name or description.

Click any memory to select it. The main area then shows its reading view.

### Reading a memory (DETAIL view)

The default view shows the memory's name, its type and scope, and the markdown body.
`[[wikilinks]]` in the body are clickable and navigate to the linked memory. Below the
body is a **CONNECTIONS** section that lists:

- **Outgoing links** (`→ name`) — every `[[name]]` the memory contains. Click to jump to
  that memory.
- **Backlinks** (`← name`) — every other memory that links to this one.
- **Jump to origin session** — if this memory was created during a Claude Code session,
  a button switches the sidebar back to **SESSIONS** mode and selects that session, so
  you can replay the conversation that produced the memory.

If no matching session is found (deleted or compacted), the button is absent.

You can also edit or delete from the DETAIL view (see below).

### GRAPH view

Click **GRAPH** in the top-right toggle to see the whole store as a force-directed
constellation. Each node is a memory (colored by type), and lines connect memories that
link to each other. Click any node to select that memory and switch to the DETAIL view.

### STATS view

Click **STATS** to see four panels side by side:

- **Composition** — total count, a bar per type showing relative volume, and a per-scope
  breakdown.
- **Health** — counts of orphans (memories with no links in or out), broken links
  (`[[name]]` that points to a missing memory), memories absent from the `MEMORY.md`
  index, and frontmatter parse errors.
- **Stale (>14d)** — memories whose file hasn't been modified in over 14 days.
- **Provenance** — which origin sessions produced the most memories.

### Creating a memory

Click **+ NEW MEMORY** at the top of the sidebar while in MEMORY mode. A form appears:
fill in a slug name (lowercase letters, digits, and hyphens only), a description, a type,
and the markdown body. You can type `[[` in the body field and a suggestion list will
appear with matching memory names. Click **SAVE** to write the memory to disk.

The new memory is automatically added to the scope's `MEMORY.md` index.

### Editing a memory

With a memory selected, click **✎ edit** in the DETAIL view to open the same form
pre-filled. You can change the description, type, and body. The slug cannot be changed
(rename is not yet supported). Click **SAVE** to write the changes.

Before overwriting, ClaudeWatch backs up the previous version to
`memory/.backups/<name>.<mtime>.md` inside the same scope directory, so your edits are
recoverable.

> **Note:** edits write directly to your real `~/.claude` — the same location Claude Code
> reads. Changes are reflected the next time Claude Code runs.

### Deleting a memory

Click **🗑 delete** in the DETAIL view and confirm. If other memories link to this one,
a warning lists them so you know which `[[links]]` will become broken. The deleted file is
backed up to `memory/.backups/` before removal, and its line is removed from `MEMORY.md`.

---

## 10. The Token Usage page

Choose **USAGE** in the sidebar dropdown (or use the Token Usage link) to see how many
tokens your Claude Code sessions have used across your whole machine. It shows:

- **A per-model summary** — how many tokens each model (Opus, Sonnet, Haiku, etc.) used,
  split into input, output, and cached tokens, with bars to compare them at a glance.
- **A daily chart** — token use per day over time, broken down by model. You can switch the
  time range (e.g. last 7 days, 30 days, or all time).

Token counts are the primary view; estimated dollar figures (at API list prices) appear as ≈ $ chips, with full cost breakdowns in the SPEND view.

### SPEND view

The USAGE page has a `TOKENS | SPEND` toggle. SPEND estimates what your usage would
cost at Anthropic's published API list prices (your subscription covers the actual
usage — no API calls are made; this is local arithmetic). Two sub-views:

- **BARS** — monthly cost as stacked bars per model, with a month-by-month ledger
  (input / output / cache-read / cache-write columns; click a month for per-model detail).
- **MATRIX** — stat cards (all-time, this month, avg/month, top model) plus a
  month × model grid; click a cell for that cell's full cost breakdown.

Token history is stored in `.local/usage/` inside the repo (not committed), so the
dashboard keeps data older than Claude Code's ~1-month log retention. Delete that
folder to reset. Monthly price files in `.local/usage/prices/` can be hand-edited.

---

## 11. Tips & FAQ

**Why is part of the graph dark/faded?**
That's a *pruned* branch — a path the agent started down but abandoned (often because
something there failed). It's dimmed so the path that actually worked stands out.

**What are the violet/purple parts?**
Those belong to a **subagent** — a helper task the main agent spun up. The violet color and
the `⌥` shape mark everything that subagent did. During playback the trail dips into the
subagent's work and then returns to the main flow, matching the real order things happened.

**A node is red — what does that mean?**
A step that failed: a command that errored, a file that wasn't found, and so on. Use the
**next-failure** jump button (`⊘` in the controls) to hop straight to failures.

**The camera keeps moving on its own.**
That's FOLLOW mode tracking the playhead. Pan or zoom yourself to take manual control, or
press `L` to toggle it.

**My session is huge and won't render.**
Very large sessions (over ~1000 Thoughts) show a confirmation first, to avoid slowing your
browser. You can confirm to render it anyway.

**I don't see a session I expected.**
ClaudeWatch only lists sessions that include at least one response from the agent, and it
reads from Claude Code's local logs (`~/.claude/projects`). A brand-new or empty session
may not appear.

**Which browser should I use?**
Chrome or Edge. Firefox and Safari aren't tested.