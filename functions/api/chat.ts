// Cloudflare Pages Function for /api/chat. The logic lives in chat/lib/handler.ts.
import { handleChat } from '../../chat/lib/handler.ts';
import type { Env } from '../../chat/lib/types.ts';

interface Context {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

export const onRequest = (context: Context) => handleChat(context.request, context.env, context);
