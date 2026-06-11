/* SPDX-License-Identifier: AGPL-3.0-only */
import { attachments as attachmentsApi } from '../../api/client';
import { AttachmentCard } from '../../components/AttachmentCard';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { useIncidentDetail } from './useIncidentDetail';
import { useSetAiContext } from '../../components/ai/aiAssistantContext';
import { useTranslations } from 'use-intl';
import { IncidentDetailHeader } from './IncidentDetailHeader';
import { IncidentMajorLinkCard } from './IncidentMajorLinkCard';
import { IncidentSummaryCard, IncidentCallerCard, IncidentServiceContextCard } from './incidentFormCards';
import { IncidentDetailsCard, IncidentJournalCard } from './incidentActivity';
import { KbResolveModal } from './KbResolveModal';
import { IncidentIntelligenceSidebar } from './IncidentIntelligenceSidebar';

export default function IncidentDetail() {
  const d = useIncidentDetail();
  const {
    navigate, inc, loading, loadError, formError,
    intelligenceOpen, saving,
    fileAttachments, attachmentsLoading, uploading, dragOver, setDragOver, fileInputRef,
    previewUrl, previewName, closePreview,
    kbSuggestions, kbResolveOpen, setKbResolveOpen, handleResolveWithKb,
    handleDrop, handleFileUpload, handleDeleteAttachment, handlePreview, formatSize,
  } = d;

  const tIncidents = useTranslations('pages.incidents');

  useSetAiContext(inc ? { incidentId: inc.id } : undefined);

  if (loading) return <Spinner />;
  if (!inc) {
    return (
      <>
        <PageHeader title={tIncidents('notFoundTitle')} description={tIncidents('notFoundDescription')} />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || tIncidents('notFoundMessage')}
          </p>
          <Button type="button" variant="outline" onClick={() => navigate('/incidents')}>
            {tIncidents('backToIncidents')}
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <IncidentDetailHeader d={d} />

      <IncidentMajorLinkCard d={d} />

      {formError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {formError}
        </div>
      )}

      <div className={intelligenceOpen ? 'xl:flex xl:items-start xl:gap-6' : ''}>
        <div className="min-w-0 flex-1">

          <IncidentSummaryCard d={d} />

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">

            {/* ── Left pane ── */}
            <div className="space-y-6 lg:col-start-1">
              <IncidentCallerCard d={d} />
              <IncidentServiceContextCard d={d} />
            </div>

            {/* ── Center pane ── */}
            <div className="space-y-6 min-w-0 lg:col-start-2">
              <IncidentDetailsCard d={d} />

              <AttachmentCard
                attachments={fileAttachments}
                loading={attachmentsLoading}
                uploading={uploading}
                dragOver={dragOver}
                fileInputRef={fileInputRef}
                previewUrl={previewUrl}
                previewName={previewName}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClickZone={() => fileInputRef.current?.click()}
                onFileChange={(files) => handleFileUpload(files)}
                onPreview={handlePreview}
                onDownload={(a) => attachmentsApi.download(a.id, a.file_name)}
                onDelete={handleDeleteAttachment}
                onClosePreview={closePreview}
                formatSize={formatSize}
              />

              <IncidentJournalCard d={d} />
            </div>
          </div>
        </div>

        {/* ── Resolve with KB Modal ── */}
        {kbResolveOpen && (
          <KbResolveModal
            kbSuggestions={kbSuggestions}
            saving={saving}
            onResolve={handleResolveWithKb}
            onClose={() => setKbResolveOpen(false)}
          />
        )}

        {/* ── Intelligence Sidebar ── */}
        {intelligenceOpen && <IncidentIntelligenceSidebar d={d} />}
      </div>
    </>
  );
}
