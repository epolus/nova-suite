/* SPDX-License-Identifier: AGPL-3.0-only */

type EnvMap = Record<string, string | undefined>;
const viteEnv: EnvMap = ((import.meta as unknown as { env?: EnvMap }).env) ?? {};

function env(key: string): string | undefined {
  return viteEnv[key];
}

function envFlag(key: string): boolean {
  const value = env(key)?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/** Hide demo quick-login buttons on the login page (set `VITE_HIDE_DEMO_LOGIN_CREDENTIALS=true`). */
export const hideDemoLoginCredentials = envFlag('VITE_HIDE_DEMO_LOGIN_CREDENTIALS');
