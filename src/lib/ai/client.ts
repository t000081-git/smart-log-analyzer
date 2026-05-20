// AI backend abstraction — OpenRouter (cloud) or Ollama (local).
// Controlled entirely by env vars; no code branching at call sites.
//
// AI_BACKEND=openrouter  → routes to OpenRouter API (OpenAI-compatible)
// AI_BACKEND=ollama      → routes to local Ollama instance
//
// All functions return model identity alongside results so the pipeline
// can write attribution columns (embedding_model_*, summary_model_*,
// pipeline_version) without hardcoding model names at call sites.

import OpenAI from 'openai'

export type AIProvider = 'openrouter' | 'ollama'

const backend = (process.env.AI_BACKEND ?? 'openrouter') as AIProvider

const clients = {
  openrouter: new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    },
  }),
  ollama: new OpenAI({
    baseURL: `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1`,
    apiKey: 'ollama',
  }),
}

const models = {
  text: {
    openrouter: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    ollama: process.env.OLLAMA_MODEL ?? 'llama3.2',
  },
  embedding: {
    openrouter: process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small',
    ollama: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
  },
}

// Convenience constants — model identity at module load time.
// Use these when you need attribution info before or without making a call.
export const activeProvider: AIProvider = backend
export const activeTextModel: string = models.text[backend]
export const activeEmbeddingModel: string = models.embedding[backend]

export interface TextResult {
  text: string
  provider: AIProvider
  model: string
}

export interface EmbeddingResult {
  embedding: number[]
  provider: AIProvider
  model: string
}

export interface EmbeddingsResult {
  embeddings: number[][]
  provider: AIProvider
  model: string
}

// Retry wrapper for transient LLM-provider failures (429 rate limit, 5xx).
// Without this, a single 429 mid-batch produces partial pipeline output with
// no error surfaced to the caller — known silent-truncation failure mode that
// produces rows with empty summary_text and looks like "success" from the DB.
// 3 attempts with exponential backoff: 1s, 2s, 4s (no jitter for predictability).
async function withRetry<T>(
  operation: () => Promise<T>,
  opLabel: string,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      const status = (err as { status?: number })?.status
      // Retryable: rate-limit, transient server errors, or network failures (no status).
      const retryable = !status || status === 429 || (status >= 500 && status < 600)
      if (!retryable || attempt === maxAttempts) {
        throw err
      }
      const delayMs = 1000 * Math.pow(2, attempt - 1)
      console.warn(
        `[ai] ${opLabel} attempt ${attempt}/${maxAttempts} failed (status=${status ?? 'network'}); retrying in ${delayMs}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

export async function generateText(
  userPrompt: string,
  systemPrompt?: string
): Promise<TextResult> {
  const model = models.text[backend]
  const response = await withRetry(
    () => clients[backend].chat.completions.create({
      model,
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: userPrompt },
      ],
    }),
    'generateText',
  )
  return {
    text: response.choices[0]?.message?.content ?? '',
    provider: backend,
    model,
  }
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const model = models.embedding[backend]
  const response = await withRetry(
    () => clients[backend].embeddings.create({ model, input: text }),
    'generateEmbedding',
  )
  return {
    embedding: response.data[0]?.embedding ?? [],
    provider: backend,
    model,
  }
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingsResult> {
  const model = models.embedding[backend]
  const response = await withRetry(
    () => clients[backend].embeddings.create({ model, input: texts }),
    'generateEmbeddings',
  )
  return {
    embeddings: response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding),
    provider: backend,
    model,
  }
}
