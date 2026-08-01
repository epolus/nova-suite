/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import UnsavedChangesDialog from '../../components/ui/UnsavedChangesDialog';
import { NewIncidentSidebar } from './NewIncidentSidebar';
import { NewIncidentForm } from './NewIncidentForm';
import { useNewIncident } from './useNewIncident';

export default function NewIncident() {
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const state = useNewIncident(tIncidents);

  return (
    <>
      <UnsavedChangesDialog
        open={state.unsavedDialogOpen}
        saving={state.unsavedDialogSaving}
        onStay={state.stayOnPage}
        onLeave={state.leaveWithoutSaving}
        onSaveAndLeave={state.saveAndLeave}
      />
      <PageHeader
        title={tIncidents('newIncident')}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => { void state.handleSubmit(); }} disabled={state.submitting}>
              {state.submitting ? tIncidents('creating') : tIncidents('createIncident')}
            </Button>
            <Button variant="outline" onClick={() => state.setSidebarOpen((p) => !p)}>
              {state.sidebarOpen ? tIncidents('hideInsights') : tIncidents('showInsights')}
            </Button>
            <Button variant="outline" onClick={() => state.guardNavigate('/incidents')}>{tActions('cancel')}</Button>
          </div>
        }
      />

      {state.error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {state.error}
        </div>
      )}

      <div className={state.sidebarOpen ? 'xl:flex xl:items-start xl:gap-6' : ''}>
        <div className="min-w-0 flex-1">
          <NewIncidentForm state={state} />
        </div>

        {state.sidebarOpen && (
          <NewIncidentSidebar
            similarIncidents={state.similarIncidents}
            kbSuggestions={state.kbSuggestions}
            loadingSidebar={state.loadingSidebar}
            navigate={state.guardNavigate}
          />
        )}
      </div>
    </>
  );
}
