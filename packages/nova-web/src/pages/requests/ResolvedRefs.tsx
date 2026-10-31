/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { cmdb, auth, catalog } from '../../api/client';

export function ResolvedCmdbRef({ ciId }: { ciId: string }) {
  const [label, setLabel] = useState<string>(ciId);
  useEffect(() => {
    cmdb.item(ciId).then((ci) => {
      setLabel(ci.name || ciId);
    }).catch(() => {});
  }, [ciId]);
  return (
    <Link to={`/cmdb/${ciId}`} className="text-indigo-600 hover:text-indigo-800 hover:underline">
      {label}
    </Link>
  );
}

export function ResolvedUserRef({ userId }: { userId: string }) {
  const [label, setLabel] = useState<string>(userId);
  useEffect(() => {
    auth.users().then((res) => {
      const u = res.users.find((u: any) => u.id === userId);
      if (u) setLabel(u.display_name || u.email);
    }).catch(() => {});
  }, [userId]);
  return <span>{label}</span>;
}

export function ResolvedLocationRef({ locationId }: { locationId: string }) {
  const [label, setLabel] = useState<string>(locationId);
  useEffect(() => {
    catalog.locations().then((res) => {
      const loc = res.locations.find((row) => row.id === locationId);
      if (loc) setLabel(loc.name);
    }).catch(() => {});
  }, [locationId]);
  return <span>{label}</span>;
}

export function FormFieldValue({ type, value }: { type?: string; value: unknown }) {
  const tStates = useTranslations('common.states');
  if (type === 'cmdb_ref' && value) return <ResolvedCmdbRef ciId={String(value)} />;
  if (type === 'user_ref' && value) return <ResolvedUserRef userId={String(value)} />;
  if (type === 'location_ref' && value) return <ResolvedLocationRef locationId={String(value)} />;
  if (type === 'checkbox') return <>{String(value) === 'true' ? tStates('yes') : tStates('no')}</>;
  return <>{String(value)}</>;
}
