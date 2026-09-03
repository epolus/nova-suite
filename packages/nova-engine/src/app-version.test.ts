/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './app-version';

describe('APP_VERSION', () => {
  it('is a semver x.y.z string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
