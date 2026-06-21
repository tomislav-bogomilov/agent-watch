export type BlockStatus = 'completed' | 'active' | 'upcoming';
export type Verbosity = 'overview' | 'steps' | 'detailed';
export type NarratorModel = 'haiku' | 'sonnet';

export interface NarrativeBlock {
  id: string;
  phase: string;            // coarse group label for verbosity re-bucketing
  title: string;
  summary: string;
  detail?: string;
  status: BlockStatus;
  startMilestoneId: string;
  endMilestoneId: string;
  thoughtCount?: number;
  toolCount?: number;
}

export interface NarrativeState {
  blocks: NarrativeBlock[];
  building: boolean;
  error: string | null;
  model: NarratorModel;
  generatedAt: string | null;  // ISO; null until first build completes
}

export function emptyNarrativeState(): NarrativeState {
  return { blocks: [], building: false, error: null, model: 'haiku', generatedAt: null };
}
