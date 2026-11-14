/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';

export type CsatPublicView = {
  incident_number: string;
  incident_title: string;
  submitted: boolean;
  score: number | null;
  comment: string | null;
  submitted_at: string | null;
};

export type CsatIncidentView = {
  id: string;
  incident_id: string;
  score: number | null;
  comment: string | null;
  submitted_at: string | null;
  created_at: string;
  token?: string;
};

export const csat = {
  getByToken: (token: string) =>
    request<CsatPublicView>(`/csat/${encodeURIComponent(token)}`),
  submitByToken: (token: string, data: { score: number; comment?: string | null }) =>
    request<CsatPublicView>(`/csat/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getForIncident: (incidentId: string) =>
    request<{ satisfaction: CsatIncidentView | null }>(
      `/csat/incident/${encodeURIComponent(incidentId)}`,
    ),
};
