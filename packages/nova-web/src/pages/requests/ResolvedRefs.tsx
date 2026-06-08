/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cmdb, auth } from '../../api/client';

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
