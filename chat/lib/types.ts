// Minimal shapes for the Cloudflare bindings the assistant uses, so the code
// doesn't depend on @cloudflare/workers-types.

export interface SearchHandle {
  search(input: unknown): Promise<unknown>;
}

export interface Env {
  /** Workers AI binding: runs the models, and (on Pages) reaches AI Search through autorag(). */
  AI?: {
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
    autorag?(name: string): SearchHandle;
  };
  /** AI Search namespace binding (Workers only; Pages doesn't offer it yet). */
  AI_SEARCH?: { get(name: string): SearchHandle };
  AI_SEARCH_INSTANCE?: string;
  CHAT_MODEL?: string;
  PLANNER_MODEL?: string;
  /** Set to "false" to switch the assistant off without a code change. */
  CHAT_ENABLED?: string;
  /** Per-visitor question limits (defaults: 8 a minute, 40 an hour). */
  RATE_PER_MINUTE?: string;
  RATE_PER_HOUR?: string;
  /** reasoning_effort for the answer model, for models that have one (e.g. "none"). */
  CHAT_REASONING?: string;
  /** "true" on previews while testing: allows x-chat-model / x-reasoning-effort headers and adds debug info. */
  CHAT_EVAL?: string;
}

export interface Chunk {
  key: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
