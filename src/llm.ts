import { config } from './config.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Completion {
  content: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

interface RawCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One chat completion from the System 2 model (any OpenAI-compatible endpoint). */
export async function complete(
  messages: ChatMessage[],
  { maxTokens = 12_000, temperature = 0.2 }: { maxTokens?: number; temperature?: number } = {},
): Promise<Completion> {
  const started = performance.now();
  const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.llm.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.llm.model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as RawCompletion;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty message');
  return {
    content,
    latencyMs: Math.round(performance.now() - started),
    promptTokens: body.usage?.prompt_tokens ?? 0,
    completionTokens: body.usage?.completion_tokens ?? 0,
  };
}
