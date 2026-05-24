export type MilestoneKind =
  | 'root_prompt'
  | 'assistant_turn'
  | 'tool_call'
  | 'subagent_spawn'
  | 'user_followup'
  | 'completion';

export type ContextUsage = {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
};

export type Milestone = {
  id: string;
  kind: MilestoneKind;
  label: string;
  summary: string;
  result?: string;
  detail?: string;
  timestamp: string;
  failed: boolean;
  toolName?: string;
  raw: unknown;
  children: Milestone[];
  usage?: ContextUsage;
  contextSize?: number;
};

export type Session = {
  id: string;
  cwd: string;
  startedAt: string;
  root: Milestone;
  successPath: Set<string>;
  totalMilestones: number;
  subagentMtimes: Record<string, string>;
};

export type RawEvent = {
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  type: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  sessionId?: string;
  cwd?: string;
  message?: {
    role: 'user' | 'assistant';
    content: string | RawContentBlock[];
  };
  [key: string]: unknown;
};

export type RawContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | RawContentBlock[]; is_error?: boolean };

export type SessionPayload = {
  projectId: string;
  sessionId: string;
  cwd: string;
  jsonl: string;
  subagents: { id: string; jsonl: string; lastUpdatedAt: string }[];
};

export type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
};

export type PromptMeta = {
  projectId: string;
  sessionId: string;
  promptId: string;
  kind: 'root' | 'followup';
  text: string;
  timestamp: string;
  ordinal: number;
};
