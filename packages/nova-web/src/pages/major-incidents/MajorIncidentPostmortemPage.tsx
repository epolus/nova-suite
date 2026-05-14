/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { majorIncidents as majorIncidentsApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { canManageMajorIncidents } from '../../utils/roles';

function linesToArray(s: string): string[] {
  return s.split('\n').map((x) => x.trim()).filter(Boolean);
}

export default function MajorIncidentPostmortemPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canManage = canManageMajorIncidents(user?.roles);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pm, setPm] = useState<Record<string, unknown> | null>(null);
  const [rootText, setRootText] = useState('');
  const [contribText, setContribText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const { postmortem } = await majorIncidentsApi.getPostmortem(id);
      setPm(postmortem);
      if (postmortem) {
        setRootText(((postmortem.root_causes as string[]) || []).join('\n'));
        setContribText(((postmortem.contributing_factors as string[]) || []).join('\n'));
      }
      setErr('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const ensureDraft = async () => {
    if (!id || pm) return;
    setSaving(true);
    try {
      await majorIncidentsApi.createPostmortem(id, { status: 'draft' });
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create postmortem');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!id) return;
    setSaving(true);
    try {
      if (!pm) await majorIncidentsApi.createPostmortem(id, {
        status: 'draft',
        root_causes: linesToArray(rootText),
        contributing_factors: linesToArray(contribText),
      });
      else {
        await majorIncidentsApi.patchPostmortem(id, {
          root_causes: linesToArray(rootText),
          contributing_factors: linesToArray(contribText),
          status: 'draft',
        });
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!id) return;
    const root_causes = linesToArray(rootText);
    const contributing_factors = linesToArray(contribText);
    setSaving(true);
    try {
      await majorIncidentsApi.publishPostmortem(id, { root_causes, contributing_factors });
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Postmortem"
        description="Blameless review — focus on systemic causes (min. 3 characters per line)."
        action={(
          <Link to={id ? `/major-incidents/${id}` : '/major-incidents'} className="text-sm text-indigo-600 hover:underline">
            Back to war room
          </Link>
        )}
      />
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {!canManage && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          You have read-only access. Postmortem edits require the <strong>major incident manager</strong> or <strong>admin</strong> role.
        </p>
      )}
      {!pm && (
        <Card>
          <p className="text-sm text-gray-600 mb-3">No postmortem record yet.</p>
          {canManage && (
            <Button type="button" onClick={ensureDraft} disabled={saving}>Start draft</Button>
          )}
        </Card>
      )}
      {pm && (
        <div className="space-y-4">
          <Card>
            <p className="text-xs text-gray-500 mb-4">Status: {String(pm.status)}</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Root causes (one per line)</label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[120px] mb-4"
              value={rootText}
              onChange={(e) => setRootText(e.target.value)}
              readOnly={!canManage}
              disabled={!canManage}
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">Contributing factors (one per line)</label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[120px] mb-4"
              value={contribText}
              onChange={(e) => setContribText(e.target.value)}
              readOnly={!canManage}
              disabled={!canManage}
            />
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={saveDraft} disabled={saving}>Save draft</Button>
                <Button type="button" onClick={publish} disabled={saving || pm.status === 'published'}>
                  Publish
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
