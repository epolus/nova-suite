/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Zod 4 probes `new Function('')` to decide whether JIT compilation is allowed.
 * Under a strict CSP (`script-src` without `'unsafe-eval'`), browsers still report
 * that probe as a Content-Security-Policy violation even though the throw is caught.
 * Enable jitless before any shared Zod schemas load so the probe is skipped.
 */
import { z } from 'zod';

z.config({ jitless: true });
