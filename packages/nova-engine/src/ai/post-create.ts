/* SPDX-License-Identifier: AGPL-3.0-only */
import { db } from '../data/db';
import { evaluateEssDeflection } from './ess-deflection';
import { runIncidentTriageJob } from './triage';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

/**
 * Fire-and-forget AI assist after incident create:
 * triage suggestions (+ optional priority auto-apply) and ESS KB deflection.
 */
export function schedulePostCreateAiAssist(params: {
  tenantId: string;
  actorUserId: string;
  incidentId: string;
  title: string;
  description: string | null;
  /** When true, also evaluate ESS knowledge deflection. */
  essChannel?: boolean;
}): void {
  const actor = params.actorUserId || SYSTEM_ACTOR;
  void db
    .withTenantContext(params.tenantId, actor, 'admin', async (client) => {
      await runIncidentTriageJob({
        client,
        incidentId: params.incidentId,
        tenantId: params.tenantId,
        actorUserId: actor,
        title: params.title,
        description: params.description,
      });

      if (params.essChannel) {
        await evaluateEssDeflection(client, {
          incidentId: params.incidentId,
          title: params.title,
          description: params.description,
          actorUserId: actor,
        });
      }
    })
    .catch(() => {
      /* best-effort; create path must not fail on AI */
    });
}
