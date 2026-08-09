import type { ProviderId, ProviderWarning, SessionMeta } from '../../src/parse/types';
import type { SessionProviderAdapter, SessionProviderRegistry } from './types';

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function createProviderRegistry(adapters: SessionProviderAdapter[]): SessionProviderRegistry {
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  return {
    async listSessions() {
      const settled = await Promise.allSettled(adapters.map((adapter) => adapter.listSessions()));
      const sessions: SessionMeta[] = [];
      const warnings: ProviderWarning[] = [];
      settled.forEach((result, index) => {
        const provider = adapters[index].id;
        if (result.status === 'fulfilled') {
          sessions.push(...result.value.sessions);
          warnings.push(...result.value.warnings);
        } else {
          warnings.push({ provider, message: errorMessage(result.reason) });
        }
      });
      sessions.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
      return { sessions, warnings };
    },
    async readSession(provider: ProviderId, projectId: string, sessionId: string) {
      const adapter = byId.get(provider);
      if (!adapter) throw Object.assign(new Error(`unknown provider: ${provider}`), { code: 'ENOENT' });
      return adapter.readSession(projectId, sessionId);
    },
  };
}
