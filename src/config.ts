import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  /** System 1: TypeSafe's Jev decision model. */
  jev: {
    baseUrl: env('TYPESAFE_BASE_URL', 'https://api.typesafe.ai'),
    apiKey: env('TYPESAFE_API_KEY'),
    model: env('TYPESAFE_MODEL', 'jev-latest'),
    /** Jev bills input tokens only. */
    usdPerMillionInputTokens: 0.042,
  },
  /** System 2: any OpenAI-compatible chat model that writes the code. */
  llm: {
    baseUrl: env('LLM_BASE_URL', 'https://api.inference.wandb.ai/v1'),
    apiKey: env('LLM_API_KEY'),
    model: env('LLM_MODEL', 'Qwen/Qwen3.8-27B'),
  },
  port: Number(env('PORT', '4321')),
  /** Build attempts per ticket before Capy hands it to a human. */
  maxAttempts: 3,
} as const;

export function hasKeys(): boolean {
  return Boolean(config.jev.apiKey && config.llm.apiKey);
}
