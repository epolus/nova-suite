/* SPDX-License-Identifier: AGPL-3.0-only */

export interface AuthUser {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  roles: string[];
}
