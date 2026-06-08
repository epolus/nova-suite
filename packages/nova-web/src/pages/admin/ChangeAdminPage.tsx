/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { changes } from '../../api/client';
import type { CabMeeting, ChangeBlackout, ChangeType, StandardChangeTemplate } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import UserDateTimeInput from '../../components/UserDateTimeInput';
import { formatDateTime } from '../../utils/dateTime';

export default function ChangeAdminPage() {
  const tPage = useTranslations('pages.admin.changeAdmin');
  const [types, setTypes] = useState<ChangeType[]>([]);
  const [templates, setTemplates] = useState<StandardChangeTemplate[]>([]);
  const [meetings, setMeetings] = useState<CabMeeting[]>([]);
  const [blackouts, setBlackouts] = useState<ChangeBlackout[]>([]);
  const [loadError, setLoadError] = useState('');
  const [newType, setNewType] = useState({ name: 'normal', description: '', requires_cab_approval: true, requires_manager_approval: true, auto_approve: false });
  const [newTemplate, setNewTemplate] = useState({ change_type_id: '', name: '', category: '', implementation_plan_template: '', backout_plan_template: '', test_plan_template: '' });
  const [newMeeting, setNewMeeting] = useState({ title: '', scheduled_at: '' });
  const [newBlackout, setNewBlackout] = useState({ name: '', start_date: '', end_date: '', reason: '' });

  const load = useCallback(() => {
    setLoadError('');
    Promise.all([
      changes.types(),
      changes.standardTemplates(),
      changes.cabMeetings(),
      changes.blackouts(),
    ])
      .then(([typesRes, s, m, b]) => {
        setTypes(typesRes.change_types);
        setTemplates(s.templates);
        setMeetings(m.meetings);
        setBlackouts(b.blackouts);
        setNewTemplate((p) => ({ ...p, change_type_id: p.change_type_id || typesRes.change_types[0]?.id || '' }));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : tPage('loadFailed'));
      });
  }, [tPage]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title={tPage('title')} description={tPage('description')} />
      {loadError && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{loadError}</p>
        </Card>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{tPage('changeTypes')}</h3>
          <div className="space-y-2 mb-4">
            {types.map((typeItem) => (
              <div key={typeItem.id} className="p-2 border rounded-lg">
                <p className="text-sm font-medium">{typeItem.name}</p>
                <p className="text-xs text-gray-500">{typeItem.description || tPage('noDescription')}</p>
                <label className="text-xs flex items-center gap-2 mt-1">
                  <input type="checkbox" checked={typeItem.is_active} onChange={(e) => changes.updateType(typeItem.id, { is_active: e.target.checked }).then(load)} />
                  {tPage('active')}
                </label>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input value={newType.name} onChange={(e) => setNewType((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('typeNamePlaceholder')} />
            <input value={newType.description} onChange={(e) => setNewType((p) => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('descriptionPlaceholder')} />
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={newType.requires_cab_approval} onChange={(e) => setNewType((p) => ({ ...p, requires_cab_approval: e.target.checked }))} /> {tPage('cab')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={newType.requires_manager_approval} onChange={(e) => setNewType((p) => ({ ...p, requires_manager_approval: e.target.checked }))} /> {tPage('manager')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={newType.auto_approve} onChange={(e) => setNewType((p) => ({ ...p, auto_approve: e.target.checked }))} /> {tPage('autoApprove')}</label>
            </div>
            <button onClick={() => changes.createType(newType).then(() => { setNewType({ name: 'normal', description: '', requires_cab_approval: true, requires_manager_approval: true, auto_approve: false }); load(); })} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">{tPage('addType')}</button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{tPage('standardTemplates')}</h3>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="p-2 border rounded-lg">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-gray-500">{t.change_type_name} • {t.category || tPage('uncategorized')}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <select value={newTemplate.change_type_id} onChange={(e) => setNewTemplate((p) => ({ ...p, change_type_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input value={newTemplate.name} onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('templateNamePlaceholder')} />
            <input value={newTemplate.category} onChange={(e) => setNewTemplate((p) => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('categoryPlaceholder')} />
            <textarea value={newTemplate.implementation_plan_template} onChange={(e) => setNewTemplate((p) => ({ ...p, implementation_plan_template: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder={tPage('implementationTemplate')} />
            <textarea value={newTemplate.backout_plan_template} onChange={(e) => setNewTemplate((p) => ({ ...p, backout_plan_template: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder={tPage('backoutTemplate')} />
            <button onClick={() => changes.createStandardTemplate(newTemplate).then(() => { setNewTemplate((p) => ({ ...p, name: '', category: '', implementation_plan_template: '', backout_plan_template: '', test_plan_template: '' })); load(); })} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">{tPage('addTemplate')}</button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{tPage('cabMeetings')}</h3>
          <div className="space-y-2 mb-4">
            {meetings.map((m) => (
              <div key={m.id} className="p-2 border rounded-lg">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-gray-500">{formatDateTime(m.scheduled_at)} • {m.status}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input value={newMeeting.title} onChange={(e) => setNewMeeting((p) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('meetingTitlePlaceholder')} />
            <UserDateTimeInput
              value={newMeeting.scheduled_at}
              onChange={(v) => setNewMeeting((p) => ({ ...p, scheduled_at: v }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <button onClick={() => changes.createCabMeeting({ title: newMeeting.title, scheduled_at: new Date(newMeeting.scheduled_at).toISOString() }).then(() => { setNewMeeting({ title: '', scheduled_at: '' }); load(); })} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">{tPage('scheduleCab')}</button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{tPage('blackoutPeriods')}</h3>
          <div className="space-y-2 mb-4">
            {blackouts.map((b) => (
              <div key={b.id} className="p-2 border border-red-200 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-800">{b.name}</p>
                <p className="text-xs text-red-700">{formatDateTime(b.start_date)} → {formatDateTime(b.end_date)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input value={newBlackout.name} onChange={(e) => setNewBlackout((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('blackoutNamePlaceholder')} />
            <UserDateTimeInput
              value={newBlackout.start_date}
              onChange={(v) => setNewBlackout((p) => ({ ...p, start_date: v }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <UserDateTimeInput
              value={newBlackout.end_date}
              onChange={(v) => setNewBlackout((p) => ({ ...p, end_date: v }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input value={newBlackout.reason} onChange={(e) => setNewBlackout((p) => ({ ...p, reason: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tPage('reasonPlaceholder')} />
            <button onClick={() => changes.createBlackout({ ...newBlackout, start_date: new Date(newBlackout.start_date).toISOString(), end_date: new Date(newBlackout.end_date).toISOString() }).then(() => { setNewBlackout({ name: '', start_date: '', end_date: '', reason: '' }); load(); })} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">{tPage('addBlackout')}</button>
          </div>
        </Card>
      </div>
    </>
  );
}
