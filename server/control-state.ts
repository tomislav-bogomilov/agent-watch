export type GateDecision =
  // allow lets the held tool call PROCEED (the agent continues). An optional
  // `context` carries the user's steer note as model-visible guidance — the
  // agent continues AND reads the note. We deliberately do NOT use a "deny"
  // here: deny blocks the tool call, and the model treats that as a stop
  // signal rather than continuing, which is the opposite of "resume".
  | { action: 'allow'; context?: string }
  | { action: 'poll' };

export type Owner = 'main' | string;            // string = agent file id, e.g. 'agent-0'
export type ControlTarget = 'all' | Owner;
export type GateInfo = { toolUseId: string; toolName: string; toolInputSummary: string };

export type HeldInfo = {
  toolUseId: string;
  owner: Owner | 'unknown';
  toolName: string;
  toolInputSummary: string;
  heldSince: number;
};

export type ControlSnapshot = {
  all: boolean;
  main: boolean;
  agents: Record<string, boolean>;
  held: HeldInfo[];
  pendingNotes: string[];                        // targets that have a note waiting
};

type HeldEntry = HeldInfo & {
  resolve: (d: GateDecision) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SessionControl = {
  projectId: string;
  all: boolean;
  main: boolean;
  agents: Map<string, boolean>;
  notes: Map<ControlTarget, string>;
  held: Map<string, HeldEntry>;
};

export const HOLD_MS = 55_000;
export const STEER_PREFIX = 'Guidance from the user (sent via ThoughtGraph while you were paused): ';
export const STEER_SUFFIX =
  ' — You are now resumed; continue your work with this guidance in mind.';

export function createControlStore() {
  const sessions = new Map<string, SessionControl>();

  function ensure(sessionId: string, projectId: string): SessionControl {
    let s = sessions.get(sessionId);
    if (!s) {
      s = { projectId, all: false, main: false, agents: new Map(), notes: new Map(), held: new Map() };
      sessions.set(sessionId, s);
    }
    s.projectId = projectId;
    return s;
  }

  function isPaused(s: SessionControl, owner: Owner | 'unknown'): boolean {
    if (s.all) return true;
    if (owner === 'unknown') return false;       // targeted pause never freezes an unidentified caller
    if (owner === 'main') return s.main;
    return s.agents.get(owner) === true;
  }

  function takeNote(s: SessionControl, owner: Owner | 'unknown'): string | null {
    if (owner !== 'unknown') {
      const own = s.notes.get(owner);
      if (own !== undefined) { s.notes.delete(owner); return own; }
    }
    const all = s.notes.get('all');
    if (all !== undefined) { s.notes.delete('all'); return all; }
    return null;
  }

  function release(s: SessionControl, entry: HeldEntry, decision: GateDecision): void {
    clearTimeout(entry.timer);
    s.held.delete(entry.toolUseId);
    entry.resolve(decision);
  }

  // After any pause/resume, settle held entries whose pause flag cleared.
  function reevaluate(sessionId: string): void {
    const s = sessions.get(sessionId);
    if (!s) return;
    for (const entry of [...s.held.values()]) {
      if (isPaused(s, entry.owner)) continue;
      const note = takeNote(s, entry.owner);
      // Always allow (let the agent continue); attach the note as guidance.
      release(s, entry, note
        ? { action: 'allow', context: STEER_PREFIX + note + STEER_SUFFIX }
        : { action: 'allow' });
    }
  }

  return {
    pause(sessionId: string, projectId: string, target: ControlTarget): void {
      const s = ensure(sessionId, projectId);
      if (target === 'all') s.all = true;
      else if (target === 'main') s.main = true;
      else s.agents.set(target, true);
    },

    resume(sessionId: string, projectId: string, target: ControlTarget, note?: string): void {
      const s = ensure(sessionId, projectId);
      if (target === 'all') { s.all = false; s.main = false; s.agents.clear(); }
      else if (target === 'main') s.main = false;
      else s.agents.delete(target);
      if (note) s.notes.set(target, note);
      reevaluate(sessionId);
    },

    /** Decide a gate request. May stay pending up to holdMs, then answers 'poll'. */
    gate(sessionId: string, owner: Owner | 'unknown', info: GateInfo, holdMs: number = HOLD_MS): Promise<GateDecision> {
      const s = sessions.get(sessionId);
      if (!s) return Promise.resolve({ action: 'allow' });
      // Pause takes precedence over any pending note: if the user (re-)paused,
      // HOLD and leave the note pending — it's delivered when they resume. (If
      // we consumed the note here, a leftover note from an earlier resume would
      // bypass a fresh pause and the agent would run right through it.)
      if (!isPaused(s, owner)) {
        const note = takeNote(s, owner);
        // Not paused, but a note is waiting (user resumed with guidance while
        // nothing was held) → allow + deliver it on this next tool call.
        if (note) return Promise.resolve({ action: 'allow', context: STEER_PREFIX + note + STEER_SUFFIX });
        return Promise.resolve({ action: 'allow' });
      }
      return new Promise<GateDecision>((resolve) => {
        const entry: HeldEntry = {
          toolUseId: info.toolUseId,
          owner,
          toolName: info.toolName,
          toolInputSummary: info.toolInputSummary,
          heldSince: Date.now(),
          resolve,
          timer: setTimeout(() => release(s, entry, { action: 'poll' }), holdMs),
        };
        s.held.set(info.toolUseId, entry);
      });
    },

    /** Cheap check so the gate hot path can skip transcript I/O entirely. */
    isEngaged(sessionId: string): boolean {
      const s = sessions.get(sessionId);
      return !!s && (s.all || s.main || s.agents.size > 0 || s.notes.size > 0 || s.held.size > 0);
    },

    projectIdOf(sessionId: string): string | null {
      return sessions.get(sessionId)?.projectId ?? null;
    },

    snapshot(sessionId: string): ControlSnapshot {
      const s = sessions.get(sessionId);
      if (!s) return { all: false, main: false, agents: {}, held: [], pendingNotes: [] };
      return {
        all: s.all,
        main: s.main,
        agents: Object.fromEntries(s.agents),
        held: [...s.held.values()].map(({ resolve: _r, timer: _t, ...info }) => info),
        pendingNotes: [...s.notes.keys()],
      };
    },
  };
}

export type ControlStore = ReturnType<typeof createControlStore>;
