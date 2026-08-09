export type MilestoneKind =
  | 'root_prompt'
  | 'assistant_turn'
  | 'tool_call'
  | 'subagent_spawn'
  | 'user_followup'
  | 'completion';

export type ProviderId = 'claude' | 'codex';

export type SessionRef = {
  provider: ProviderId;
  projectId: string;
  sessionId: string;
};

export type ProviderWarning = {
  provider: ProviderId;
  message: string;
};

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
  spawnThreadId?: string;
};

export type Session = {
  provider: ProviderId;
  id: string;
  cwd: string;
  startedAt: string;
  root: Milestone;
  successPath: Set<string>;
  totalMilestones: number;
  subagentMtimes: Record<string, string>;
  skillTrack?: SkillTrack;
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
  attachment?: {
    type: string;
    // hook content arrives as a string[] in real transcripts; skill_listing
    // content is a plain string. Accept both.
    content?: string | string[];
    hookName?: string;
    skillCount?: number;
    names?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type RawContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | RawContentBlock[]; is_error?: boolean };

export type ClaudeSessionPayload = SessionRef & {
  provider: 'claude';
  projectId: string;
  sessionId: string;
  cwd: string;
  jsonl: string;
  subagents: { id: string; jsonl: string; lastUpdatedAt: string }[];
};

export type CodexSubagentPayload = {
  threadId: string;
  parentThreadId: string;
  agentPath?: string;
  agentNickname?: string;
  startedAt: string;
  lastUpdatedAt: string;
  jsonl: string;
};

export type CodexSessionPayload = SessionRef & {
  provider: 'codex';
  cwd: string;
  jsonl: string;
  subagents: CodexSubagentPayload[];
};

export type ProviderSessionPayload = ClaudeSessionPayload | CodexSessionPayload;
export type SessionPayload = ProviderSessionPayload;

export type SessionMeta = SessionRef & {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
};

export type SessionListResponse = {
  sessions: SessionMeta[];
  warnings: ProviderWarning[];
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

/** How a skill's body entered the conversation context.
 *  - 'invoked': called on demand via the Skill tool.
 *  - 'hook':    injected automatically by a hook (e.g. SessionStart). */
export type SkillSource = 'invoked' | 'hook';

export type SkillActivation = {
  name: string;
  activatedAt: string;
  byTurnId: string;
  tokenCost: number;
  source: SkillSource;
  /** For hook-injected skills, the hook event that loaded it (e.g. 'SessionStart'). */
  hookEvent?: string;
};

export type SkillTrack = {
  /** Skills whose body is actually loaded into context (invoked or hook-injected). */
  activations: SkillActivation[];
  /** Skills merely registered/available this session (from the skill_listing
   *  attachment) — name + description only, body not in context. */
  availableCount: number;
};
