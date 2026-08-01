/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { friendlyLlmError, friendlyLlmErrorFromUnknown } from './llm-errors';

describe('friendlyLlmError', () => {
  it('maps OpenAI insufficient_quota to a friendly message', () => {
    const body = JSON.stringify({
      error: {
        message: 'You exceeded your current quota, please check your plan and billing details.',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
      },
    });
    const msg = friendlyLlmError(429, body);
    expect(msg).toContain('usage limit');
    expect(msg).not.toContain('LLM request failed');
    expect(msg).not.toContain('insufficient_quota');
  });

  it('normalizes legacy thrown errors with embedded JSON', () => {
    const err = new Error(
      'LLM request failed (429): {"error":{"code":"insufficient_quota","message":"quota"}}',
    );
    expect(friendlyLlmErrorFromUnknown(err)).toContain('usage limit');
  });
});
