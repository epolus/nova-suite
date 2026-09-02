/* SPDX-License-Identifier: AGPL-3.0-only */
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import UnsavedChangesDialog from '../../components/ui/UnsavedChangesDialog';
import { hasConfigurationRole } from '../../utils/roles';
import { CiClassIcon } from '../../components/CiClassIcon';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { CiAttributeFields, UserPicker } from './cmdbFormFields';
import { useCIForm } from './useCIForm';

export default function CIForm() {
  const { user } = useAuth();
  const tCmdb = useTranslations('pages.cmdb');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();

  const {
    isEdit,
    classes,
    users,
    groups,
    locations,
    refData,
    loading,
    saving,
    error,
    step,
    setStep,
    classId,
    name,
    setName,
    displayName,
    setDisplayName,
    status,
    setStatus,
    environment,
    setEnvironment,
    managedBy,
    setManagedBy,
    assignedTo,
    setAssignedTo,
    supportedBy,
    setSupportedBy,
    locationId,
    setLocationId,
    notes,
    setNotes,
    externalId1,
    setExternalId1,
    externalId2,
    setExternalId2,
    isActive,
    setIsActive,
    attributes,
    setAttributes,
    selectedClass,
    classAttrs,
    handleClassChange,
    handleSubmit,
    unsavedDialogOpen,
    unsavedDialogSaving,
    guardNavigate,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useCIForm(tCmdb);

  if (loading) return <Spinner />;

  const canEdit = hasConfigurationRole(user?.roles);
  if (!canEdit) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{tCmdb('noPermission')}</p>
        <button onClick={() => guardNavigate(-1)} className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium">{tCmdb('goBack')}</button>
      </div>
    );
  }

  return (
    <>
      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        saving={unsavedDialogSaving}
        onStay={stayOnPage}
        onLeave={leaveWithoutSaving}
        onSaveAndLeave={saveAndLeave}
      />
      <PageHeader
        title={isEdit ? tCmdb('editTitle', { name: displayName || name }) : tCmdb('newCi')}
        description={isEdit ? `${selectedClass?.display_name || ''} · ${name}` : tCmdb('createDescription')}
        action={
          <button onClick={() => guardNavigate(-1)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            &larr; {tActions('cancel')}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!isEdit && step === 1 && (
        <div className="max-w-2xl">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('step1Title')}</h3>
            <p className="text-sm text-gray-500 mb-4">{tCmdb('step1Description')}</p>

            {classes.length === 0 ? (
              <p className="text-sm text-gray-400">{tCmdb('noCiClasses')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => { handleClassChange(cls.id); setStep(2); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                      classId === cls.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-600"><CiClassIcon name={cls.icon} className="w-7 h-7" /></span>
                      <div>
                        <h4 className="font-semibold text-gray-900">{cls.display_name}</h4>
                        {cls.description && <p className="text-xs text-gray-500 mt-0.5">{cls.description}</p>}
                        {Object.keys(cls.attributes).length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{tCmdb('attributeCount', { count: Object.keys(cls.attributes).length })}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{tCmdb('basicInformation')}</h3>
                {!isEdit && (
                  <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    {tCmdb('changeClass')}
                  </button>
                )}
              </div>

              {selectedClass && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-indigo-50 rounded-lg">
                  <span className="text-indigo-600"><CiClassIcon name={selectedClass.icon} className="w-5 h-5" /></span>
                  <span className="text-sm font-medium text-indigo-700">{selectedClass.display_name}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('name')} *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('namePlaceholder')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('displayName')}</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('displayNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('status')}</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">{tStates('active')}</option>
                    <option value="planned">{statusLabel('planned')}</option>
                    <option value="maintenance">{statusLabel('maintenance')}</option>
                    <option value="retired">{statusLabel('retired')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('environment')}</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="production">{statusLabel('production')}</option>
                    <option value="staging">{statusLabel('staging')}</option>
                    <option value="development">{statusLabel('development')}</option>
                    <option value="test">{statusLabel('test')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('location')}</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{tStates('none')}</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} - {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isEdit && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('class')}</label>
                    <select
                      value={classId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('externalId1')}</label>
                  <input
                    value={externalId1}
                    onChange={(e) => setExternalId1(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('externalId1Placeholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('externalId2')}</label>
                  <input
                    value={externalId2}
                    onChange={(e) => setExternalId2(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('externalId2Placeholder')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
                    </div>
                    <span className="text-sm text-gray-700">
                      {isActive ? tCmdb('activeCi') : tCmdb('inactiveCi')}
                    </span>
                  </label>
                </div>
              </div>
            </Card>

            {Object.keys(classAttrs).length > 0 && (
              <CiAttributeFields
                classAttrs={classAttrs}
                className={selectedClass?.display_name ?? ''}
                attributes={attributes}
                setAttributes={setAttributes}
                refData={refData}
              />
            )}

            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">{fieldLabel('notes')}</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder={tCmdb('notesPlaceholder')}
              />
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('ownership')}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('managedBy')}</label>
                  <UserPicker users={users} value={managedBy} onChange={setManagedBy} placeholder={tCmdb('selectManager')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignedTo')}</label>
                  <UserPicker users={users} value={assignedTo} onChange={setAssignedTo} placeholder={tCmdb('selectAssignee')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('supportedByGroup')}</label>
                  <select
                    value={supportedBy}
                    onChange={(e) => setSupportedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{tStates('none')}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            <button
              onClick={() => { void handleSubmit(); }}
              disabled={saving || !name.trim() || !classId}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isEdit ? tMaster('saveChanges') : tCmdb('createConfigurationItem')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
