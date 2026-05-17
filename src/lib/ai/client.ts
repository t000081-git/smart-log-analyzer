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

export async function generateText(
  userPrompt: string,
  systemPrompt?: string
): Promise<TextResult> {
  const model = models.text[backend]
  const response = await clients[backend].chat.completions.create({
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: userPrompt },
    ],
  })
  return {
    text: response.choices[0]?.message?.content ?? '',
    provider: backend,
    model,
  }
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const model = models.embedding[backend]
  const response = await clients[backend].embeddings.create({ model, input: text })
  return {
    embedding: response.data[0]?.embedding ?? [],
    provider: backend,
    model,
  }
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingsResult> {
  const model = models.embedding[backend]
  const response = await clients[backend].embeddings.create({ model, input: texts })
  return {
    embeddings: response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding),
    provider: backend,
    model,
  }
}
