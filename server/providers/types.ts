import type {
  ProviderId,
  ProviderSessionPayload,
  ProviderWarning,
  SessionMeta,
} from '../../src/parse/types';

export type ProviderListResult = {
  sessions: SessionMeta[];
  warnings: ProviderWarning[];
};

export interface SessionProviderAdapter {
  readonly id: ProviderId;
  listSessions(): Promise<ProviderListResult>;
  readSession(projectId: string, sessionId: string): Promise<ProviderSessionPayload>;
}

export interface SessionProviderRegistry {
  listSessions(): Promise<ProviderListResult>;
  readSession(provider: ProviderId, projectId: string, sessionId: string): Promise<ProviderSessionPayload>;
}
