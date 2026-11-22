/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEED_ADMIN,
  SEED_CHANGE_MGR,
  SEED_CHANGE_TYPE_NORMAL,
  SEED_FULFILLER,
  SEED_USER,
  TENANT_A,
  adminClient,
  runtimeClient,
  setTenantContext,
} from './pg';

const INCIDENT_OTHER = 'c1000000-0000-0000-0000-00000000f010';
const INCIDENT_OWNED = 'c1000000-0000-0000-0000-00000000f011';
const CHANGE_ID = 'c1000000-0000-0000-0000-00000000f020';
const PROBLEM_ID = 'c1000000-0000-0000-0000-00000000f030';
const MAJOR_ID = 'c1000000-0000-0000-0000-00000000f040';

type RbacTable = 'incidents' | 'changes' | 'problems' | 'major_incidents';

describe('postgres RBAC policies (integration)', () => {
  const admin = adminClient();
  const runtime = runtimeClient();

  beforeAll(async () => {
    await admin.connect();
    await runtime.connect();

    await admin.query(`DELETE FROM major_incidents WHERE id = $1`, [MAJOR_ID]);
    await admin.query(`DELETE FROM problems WHERE id = $1`, [PROBLEM_ID]);
    await admin.query(`DELETE FROM changes WHERE id = $1`, [CHANGE_ID]);
    await admin.query(`DELETE FROM incidents WHERE id = ANY($1::uuid[])`, [
      [INCIDENT_OTHER, INCIDENT_OWNED],
    ]);

    await admin.query(
      `INSERT INTO incidents (id, tenant_id, number, title, status, impact, urgency, priority, caller_id)
       VALUES
         ($1, $3, 'INC-RBAC-0001', 'Someone else incident', 'new', 'low', 'low', 5, $4),
         ($2, $3, 'INC-RBAC-0002', 'Jane caller incident', 'new', 'low', 'low', 5, $5)`,
      [INCIDENT_OTHER, INCIDENT_OWNED, TENANT_A, SEED_ADMIN, SEED_USER],
    );

    await admin.query(
      `INSERT INTO changes (
         id, tenant_id, number, change_type_id, title, description, reason_for_change,
         implementation_plan, backout_plan, requested_by
       ) VALUES (
         $1, $2, 'CHG-RBAC-0001', $3,
         'RBAC change', 'desc', 'reason',
         'implement', 'backout', $4
       )`,
      [CHANGE_ID, TENANT_A, SEED_CHANGE_TYPE_NORMAL, SEED_USER],
    );

    await admin.query(
      `INSERT INTO problems (id, tenant_id, number, title, reported_by)
       VALUES ($1, $2, 'PRB-RBAC-0001', 'RBAC problem', $3)`,
      [PROBLEM_ID, TENANT_A, SEED_USER],
    );

    await admin.query(
      `INSERT INTO major_incidents (id, tenant_id, title, number, created_by, status, priority)
       VALUES ($1, $2, 'RBAC major', 'MI-RBAC-0001', $3, 'declared', 1)`,
      [MAJOR_ID, TENANT_A, SEED_ADMIN],
    );
  });

  afterAll(async () => {
    await runtime.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  async function canSee(table: RbacTable, id: string, userId: string, roles: string): Promise<boolean> {
    await setTenantContext(runtime, TENANT_A, userId, roles);
    const result = await runtime.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  describe('incidents', () => {
    it('lets fulfillers see all in-tenant incidents', async () => {
      expect(await canSee('incidents', INCIDENT_OTHER, SEED_FULFILLER, 'fulfiller')).toBe(true);
      expect(await canSee('incidents', INCIDENT_OWNED, SEED_FULFILLER, 'fulfiller')).toBe(true);
    });

    it('lets ESS users see only incidents they reported', async () => {
      expect(await canSee('incidents', INCIDENT_OTHER, SEED_USER, 'user')).toBe(false);
      expect(await canSee('incidents', INCIDENT_OWNED, SEED_USER, 'user')).toBe(true);
    });

    it('lets admins see all in-tenant incidents', async () => {
      expect(await canSee('incidents', INCIDENT_OTHER, SEED_ADMIN, 'admin')).toBe(true);
    });
  });

  describe('changes', () => {
    it('lets the requester see their change without agent roles', async () => {
      expect(await canSee('changes', CHANGE_ID, SEED_USER, 'user')).toBe(true);
    });

    it('hides the change from unrelated ESS users', async () => {
      expect(await canSee('changes', CHANGE_ID, SEED_FULFILLER, 'user')).toBe(false);
    });

    it('lets change_manager and fulfiller see the change', async () => {
      expect(await canSee('changes', CHANGE_ID, SEED_CHANGE_MGR, 'change_manager')).toBe(true);
      expect(await canSee('changes', CHANGE_ID, SEED_FULFILLER, 'fulfiller')).toBe(true);
    });
  });

  describe('problems', () => {
    it('lets the reporter see their problem as a plain user', async () => {
      expect(await canSee('problems', PROBLEM_ID, SEED_USER, 'user')).toBe(true);
    });

    it('hides the problem from unrelated ESS users', async () => {
      expect(await canSee('problems', PROBLEM_ID, SEED_FULFILLER, 'user')).toBe(false);
    });

    it('lets the problem role and fulfillers see all problems', async () => {
      expect(await canSee('problems', PROBLEM_ID, SEED_ADMIN, 'problem')).toBe(true);
      expect(await canSee('problems', PROBLEM_ID, SEED_FULFILLER, 'fulfiller')).toBe(true);
    });
  });

  describe('major incidents', () => {
    it('blocks plain users from reading major incidents', async () => {
      expect(await canSee('major_incidents', MAJOR_ID, SEED_USER, 'user')).toBe(false);
    });

    it('lets fulfillers read but not update major incidents', async () => {
      expect(await canSee('major_incidents', MAJOR_ID, SEED_FULFILLER, 'fulfiller')).toBe(true);

      await setTenantContext(runtime, TENANT_A, SEED_FULFILLER, 'fulfiller');
      const updated = await runtime.query(
        `UPDATE major_incidents SET title = 'should not stick' WHERE id = $1`,
        [MAJOR_ID],
      );
      expect(updated.rowCount).toBe(0);

      const { rows } = await admin.query<{ title: string }>(
        `SELECT title FROM major_incidents WHERE id = $1`,
        [MAJOR_ID],
      );
      expect(rows[0]?.title).toBe('RBAC major');
    });

    it('lets major_incident_manager update major incidents', async () => {
      await setTenantContext(runtime, TENANT_A, SEED_ADMIN, 'major_incident_manager');
      const updated = await runtime.query(
        `UPDATE major_incidents SET title = 'RBAC major updated' WHERE id = $1`,
        [MAJOR_ID],
      );
      expect(updated.rowCount).toBe(1);

      await admin.query(`UPDATE major_incidents SET title = 'RBAC major' WHERE id = $1`, [MAJOR_ID]);
    });
  });
});
