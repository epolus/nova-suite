/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import { Button } from '../../components/ui/button';
import { incidents as incidentsApi, majorIncidents as majorIncidentsApi } from '../../api/client';

const ROLES = ['commander', 'comms_lead', 'scribe', 'resolver'] as const;

type Participant = Record<string, unknown>;

export function WarRoomRoles({
  majorIncidentId,
  participants,
  canManage,
  disabled,
  onAssigned,
  onError,
}: {
  majorIncidentId: string;
  participants: Participant[];
  canManage: boolean;
  disabled: boolean;
  onAssigned: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const t = useTranslations('pages.majorIncidents.warRoom');
  const [users, setUsers] = useState<Array<{ id: string; display_name: string }>>([]);
  const [role, setRole] = useState<(typeof ROLES)[number]>('commander');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage || disabled) return;
    let cancelled = false;
    incidentsApi.callers()
      .then((res) => {
        if (!cancelled) setUsers(res.users.map((user) => ({ id: user.id, display_name: user.display_name })));
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => { cancelled = true; };
  }, [canManage, disabled]);

  const selectedUser = users.some((user) => user.id === userId) ? userId : (users[0]?.id ?? '');

  const assign = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      await majorIncidentsApi.assignRole(majorIncidentId, { role, user_id: selectedUser });
      await onAssigned();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('assignRoleFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-3">{t('roles')}</h3>
      {participants.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">{t('noRoles')}</p>
      ) : (
        <ul className="text-sm space-y-2 mb-3">
          {participants.map((participant) => (
            <li key={String(participant.id)} className="flex justify-between gap-2">
              <span className="text-gray-500 capitalize">{String(participant.role).replace(/_/g, ' ')}</span>
              <span className="font-medium text-gray-900">{String(participant.display_name)}</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && !disabled && (
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-600">{t('assignRole')}</label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as (typeof ROLES)[number])}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>{t(`roleNames.${item}`)}</option>
            ))}
          </select>
          <select
            value={selectedUser}
            onChange={(event) => setUserId(event.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.display_name}</option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={() => void assign()} disabled={busy || !selectedUser}>
            {busy ? t('assigningRole') : t('assignRole')}
          </Button>
        </div>
      )}
    </Card>
  );
}
