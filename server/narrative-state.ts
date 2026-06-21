import { emptyNarrativeState } from '../src/narrative/types';
import type { NarrativeState, NarratorModel } from '../src/narrative/types';
import type { NarratorInputMilestone, RunNarratorResult } from './narrator';

export interface NarrativeStoreDeps {
  run: (args: {
    milestones: NarratorInputMilestone[];
    model: NarratorModel;
    cwd: string;
    since?: string;
    resumeSessionId?: string;
  }) => Promise<RunNarratorResult>;
  now: () => number;
}

export interface NarrativeRunArgs {
  milestones: NarratorInputMilestone[];
  cwd: string;
}

export interface NarrativeStore {
  get(key: string): NarrativeState;
  start(key: string, args: NarrativeRunArgs): void;
  refresh(key: string, args: NarrativeRunArgs): void;
  tick(key: string, args: NarrativeRunArgs): void;
  whenIdle(key: string): Promise<void>;
}

interface Entry {
  state: NarrativeState;
  narratorSessionId: string | null;
  lastSummarizedId: string | null;
  inFlight: Promise<void> | null;
}

export function createNarrativeStore(deps: NarrativeStoreDeps): NarrativeStore {
  const entries = new Map<string, Entry>();

  const entry = (key: string): Entry => {
    let e = entries.get(key);
    if (!e) {
      e = { state: emptyNarrativeState(), narratorSessionId: null, lastSummarizedId: null, inFlight: null };
      entries.set(key, e);
    }
    return e;
  };

  function execute(
    key: string,
    model: NarratorModel,
    args: NarrativeRunArgs,
    opts: { resume: boolean; since?: string },
  ): void {
    const e = entry(key);
    if (e.inFlight) return; // one run at a time
    e.state = { ...e.state, building: true, error: null, model };
    const lastId = args.milestones.length ? args.milestones[args.milestones.length - 1].id : null;
    e.inFlight = deps
      .run({
        milestones: args.milestones,
        model,
        cwd: args.cwd,
        since: opts.since,
        resumeSessionId: opts.resume ? e.narratorSessionId ?? undefined : undefined,
      })
      .then((res: RunNarratorResult) => {
        e.narratorSessionId = res.narratorSessionId || e.narratorSessionId;
        e.lastSummarizedId = lastId;
        e.state = {
          blocks: res.blocks, building: false, error: null, model,
          generatedAt: new Date(deps.now()).toISOString(),
        };
      })
      .catch((err: unknown) => {
        e.state = { ...e.state, building: false, error: err instanceof Error ? err.message : String(err) };
      })
      .finally(() => { e.inFlight = null; });
  }

  return {
    get: (key) => entry(key).state,
    start: (key, args) => execute(key, 'haiku', args, { resume: false }),
    refresh: (key, args) => {
      const e = entry(key);
      e.narratorSessionId = null; // fresh session for the Sonnet rebuild
      execute(key, 'sonnet', args, { resume: false });
    },
    tick: (key, args) => {
      const e = entry(key);
      if (e.inFlight || e.state.building) return;
      const lastId = args.milestones.length ? args.milestones[args.milestones.length - 1].id : null;
      if (!lastId || lastId === e.lastSummarizedId) return; // nothing new
      // delta = milestones after lastSummarizedId
      const idx = args.milestones.findIndex((m) => m.id === e.lastSummarizedId);
      const delta = idx >= 0 ? args.milestones.slice(idx + 1) : args.milestones;
      execute(key, 'haiku', { milestones: delta, cwd: args.cwd }, { resume: true, since: e.lastSummarizedId ?? undefined });
    },
    whenIdle: async (key) => {
      const e = entry(key);
      while (e.inFlight) await e.inFlight;
    },
  };
}
