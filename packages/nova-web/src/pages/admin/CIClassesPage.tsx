/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { cmdb } from '../../api/client';
import type { CIClass } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ClassEditorModal from './ci-classes/ClassEditorModal';
import {
  EMPTY_CLASS,
  ICON_VALUES,
  ICON_EMOJI,
  attrsToList,
  attrsToRecord,
  formatAttrType,
  getInheritedAttrs,
  iconEmoji,
  type ClassDraft,
} from './ci-classes/classHelpers';

export default function CIClassesPage() {
  const t = useTranslations('pages.admin.ciClasses');
  const tFields = useTranslations('common.fields');
  const tActions = useTranslations('common.actions');

  const icons = useMemo(
    () => ICON_VALUES.map((value) => ({
      value,
      label: t(`icons.${value}`),
      emoji: ICON_EMOJI[value] ?? '📦',
    })),
    [t],
  );
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClassDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');

  const load = () => {
    setLoading(true);
    cmdb.classes().then((res) => {
      setClasses(res.classes);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing({ ...EMPTY_CLASS, attributes: [] });
    setError('');
  };

  const openEdit = (cls: CIClass) => {
    setEditing({
      id: cls.id,
      name: cls.name,
      display_name: cls.display_name,
      description: cls.description || '',
      icon: cls.icon,
      parent_class: cls.parent_class || '',
      attributes: attrsToList(cls.attributes),
    });
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.display_name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!/^[a-z_]+$/.test(editing.name)) {
      setError(t('nameFormat'));
      return;
    }
    const dupeAttrs = editing.attributes
      .map((a) => a.key.trim())
      .filter((k, i, arr) => k && arr.indexOf(k) !== i);
    if (dupeAttrs.length > 0) {
      setError(t('duplicateAttributes', { keys: dupeAttrs.join(', ') }));
      return;
    }

    setSaving(true);
    setError('');
    const payload = {
      name: editing.name.trim(),
      display_name: editing.display_name.trim(),
      description: editing.description.trim() || undefined,
      icon: editing.icon,
      parent_class: editing.parent_class || undefined,
      attributes: attrsToRecord(editing.attributes),
    };

    try {
      if (editing.id) {
        await cmdb.updateClass(editing.id, payload as Partial<CIClass>);
      } else {
        await cmdb.createClass(payload as Partial<CIClass>);
      }
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setDeleting(id);
    try {
      await cmdb.deleteClass(id);
      load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting('');
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button
            onClick={openNew}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newClass')}
          </button>
        }
      />

      {/* Class list */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {classes.map((cls) => (
          <Card key={cls.id} className="relative group">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{iconEmoji(cls.icon)}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{cls.display_name}</h3>
                <p className="text-xs text-gray-400 font-mono">{cls.name}</p>
                {cls.description && <p className="text-sm text-gray-500 mt-1">{cls.description}</p>}

                {(() => {
                  const inherited = cls.parent_class ? getInheritedAttrs(cls.parent_class, classes) : [];
                  const own = Object.entries(cls.attributes);
                  if (own.length === 0 && inherited.length === 0) return null;
                  return (
                    <div className="mt-3">
                      {own.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('ownAttributes')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {own.map(([key, val]) => (
                              <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                <span className="font-medium">{key}</span>
                                <span className="text-gray-400">({formatAttrType({ key, type: val.type, reference_table: val.reference_table }, t, tFields)})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {inherited.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-gray-500 mb-1 mt-2">{t('inherited')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {inherited.map((a) => (
                              <span key={a.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
                                <span className="font-medium">{a.key}</span>
                                <span className="text-amber-400">({formatAttrType(a, t, tFields)})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => openEdit(cls)}
                className="p-1.5 bg-white border border-gray-200 rounded-md text-xs text-indigo-600 hover:bg-indigo-50"
                title={tActions('edit')}
              >
                {tActions('edit')}
              </button>
              <button
                onClick={() => handleDelete(cls.id)}
                disabled={deleting === cls.id}
                className="p-1.5 bg-white border border-gray-200 rounded-md text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                title={tActions('delete')}
              >
                {deleting === cls.id ? '...' : tActions('delete')}
              </button>
            </div>
          </Card>
        ))}

        {classes.length === 0 && (
          <p className="text-sm text-gray-400 col-span-full text-center py-8">{t('empty')}</p>
        )}
      </div>

      {/* Edit/Create Modal */}
      {editing && (
        <ClassEditorModal
          editing={editing}
          classes={classes}
          icons={icons}
          error={error}
          saving={saving}
          onChange={setEditing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
