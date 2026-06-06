/* SPDX-License-Identifier: AGPL-3.0-only */

type ProviderErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

function parseProviderError(body: string): ProviderErrorBody['error'] | undefined {
  try {
    const parsed = JSON.parse(body) as ProviderErrorBody;
    return parsed.error;
  } catch {
    return undefined;
  }
}

/** Map HTTP status + provider body to a short, user-safe message (no raw JSON). */
export function friendlyLlmError(status: number, body: string): string {
  const err = parseProviderError(body);
  const code = (err?.code ?? err?.type ?? '').toLowerCase();
  const message = (err?.message ?? '').toLowerCase();

  if (status === 429) {
    if (code === 'insufficient_quota' || message.includes('quota') || message.includes('billing')) {
      return 'The AI assistant has reached its usage limit. Please try again later, or ask your administrator to review the API plan and billing.';
    }
    return 'The AI service is receiving too many requests right now. Please wait a moment and try again.';
  }

  if (status === 401 || status === 403) {
    return 'The AI service could not authenticate. Your administrator may need to check the API key or provider configuration.';
  }

  if (status === 404) {
    if (message.includes('model') || code.includes('model')) {
      return 'The configured AI model could not be found on Ollama. Pull it with `ollama pull <model>` and ensure OLLAMA_MODEL matches `ollama list`.';
    }
    return 'The AI service endpoint was not found. For Ollama, use OLLAMA_BASE_URL without /v1 (e.g. http://ollama:11434).';
  }

  if (status >= 500) {
    return 'The AI service is temporarily unavailable. Please try again in a few minutes.';
  }

  if (status === 400 && (message.includes('model') || code.includes('model'))) {
    return 'The configured AI model is not valid for this provider. Please check your model settings.';
  }

  return 'The assistant could not complete your request right now. Please try again later.';
}

/** Normalize any thrown error for chat UI (avoid leaking provider JSON blobs). */
export function friendlyLlmErrorFromUnknown(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'The assistant could not complete your request right now. Please try again later.';
  }

  const raw = err.message;
  const statusMatch = raw.match(/(?:LLM (?:request|stream) failed|failed) \((\d{3})\)/i);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const jsonStart = raw.indexOf('{');
    const body = jsonStart >= 0 ? raw.slice(jsonStart) : '';
    return friendlyLlmError(status, body);
  }

  if (/fetch failed|econnrefused|enotfound|network/i.test(raw)) {
    return 'The assistant could not reach the AI service. Check that the provider is running and reachable, then try again.';
  }

  if (raw.includes('not configured') || raw.includes('OPENAI_API_KEY')) {
    return 'The AI assistant is not fully configured yet. Your administrator needs to set up the API connection.';
  }

  return friendlyLlmError(0, '');
}
