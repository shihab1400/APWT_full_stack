import type { Env } from '../config/env.js';
import { AiService } from './ai.service.js';

const env = {
  GEMINI_API_KEY: 'test-key',
  GEMINI_MODEL: 'primary',
  GEMINI_FALLBACK_MODELS: 'backup-1, backup-2',
} as Env;

type Behaviour = string[] | Error | { partial: string[]; failWith: Error };

/** Replaces the Gemini client with scripted per-model behaviour. */
function withModels(behaviour: Record<string, Behaviour>) {
  const service = new AiService(env);
  const calls: string[] = [];
  (service as unknown as { client: unknown }).client = {
    models: {
      generateContentStream: async ({ model }: { model: string }) => {
        calls.push(model);
        const b = behaviour[model];
        if (b instanceof Error) throw b;
        const chunks = Array.isArray(b) ? b : b.partial;
        return (async function* () {
          for (const text of chunks) yield { text };
          if (!Array.isArray(b)) throw b.failWith;
        })();
      },
    },
  };
  return { service, calls };
}

async function collect(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const t of gen) out += t;
  return out;
}

describe('AiService.streamReply', () => {
  const history = [{ role: 'user' as const, text: 'hi' }];

  it('streams from the primary model', async () => {
    const { service, calls } = withModels({ primary: ['Hello', ' there'] });
    expect(await collect(service.streamReply(history))).toBe('Hello there');
    expect(calls).toEqual(['primary']);
  });

  it('falls through rate-limited models in order', async () => {
    const { service, calls } = withModels({
      primary: new Error('429 RESOURCE_EXHAUSTED'),
      'backup-1': new Error('503 overloaded'),
      'backup-2': ['From backup'],
    });
    expect(await collect(service.streamReply(history))).toBe('From backup');
    expect(calls).toEqual(['primary', 'backup-1', 'backup-2']);
  });

  it('treats an empty (safety-blocked) reply as a failure', async () => {
    const { service, calls } = withModels({ primary: [], 'backup-1': ['ok'] });
    expect(await collect(service.streamReply(history))).toBe('ok');
    expect(calls).toEqual(['primary', 'backup-1']);
  });

  it('does not switch models once text has been sent', async () => {
    const { service, calls } = withModels({
      primary: { partial: ['Half a '], failWith: new Error('connection reset') },
      'backup-1': ['should not be used'],
    });
    await expect(collect(service.streamReply(history))).rejects.toThrow('connection reset');
    expect(calls).toEqual(['primary']);
  });

  it('throws the last error when every model fails', async () => {
    const { service } = withModels({
      primary: new Error('a'),
      'backup-1': new Error('b'),
      'backup-2': new Error('c'),
    });
    await expect(collect(service.streamReply(history))).rejects.toThrow('c');
  });

  it('refuses to run without an API key', async () => {
    const service = new AiService({ ...env, GEMINI_API_KEY: undefined });
    await expect(collect(service.streamReply(history))).rejects.toThrow('AI is not configured');
  });
});
