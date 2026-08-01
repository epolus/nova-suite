/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import UnsavedChangesDialog from '../../components/ui/UnsavedChangesDialog';
import { useAuth } from '../../context/AuthContext';
import { hasKnowledgeRole } from '../../utils/roles';
import { ArticleListPanel } from './knowledgeSections';
import { ArticleEditorPanel } from './ArticleEditorPanel';
import { useKnowledgePage } from './useKnowledgePage';

export default function KnowledgePage() {
  const t = useTranslations('pages.knowledge');
  const { user } = useAuth();
  const canManageKnowledge = hasKnowledgeRole(user?.roles);
  const page = useKnowledgePage(t, canManageKnowledge);

  if (page.loading) return <Spinner />;

  return (
    <>
      <UnsavedChangesDialog
        open={page.unsavedDialogOpen || page.switchDialogOpen}
        saving={page.unsavedDialogSaving}
        onStay={page.switchDialogOpen ? page.stayOnArticle : page.stayOnPage}
        onLeave={page.switchDialogOpen ? page.completeArticleSwitch : page.leaveWithoutSaving}
        onSaveAndLeave={page.switchDialogOpen
          ? async () => {
            const saved = await page.handleSave();
            if (saved) page.completeArticleSwitch();
          }
          : page.saveAndLeave}
      />
      <PageHeader
        title={page.isReadOnlyView ? t('titleEss') : t('titleEss')}
        description={page.isReadOnlyView ? t('descriptionEss') : t('descriptionAgent')}
        action={
          !page.isReadOnlyView ? (
            <Button onClick={page.openNew}>
              + {t('newArticle')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <ArticleListPanel
          articles={page.articles}
          categories={page.categories}
          categoryLabelById={page.categoryLabelById}
          categoryCounts={page.categoryCounts}
          filtered={page.filtered}
          isReadOnlyView={page.isReadOnlyView}
          selectedId={page.selectedId}
          selectedCategoryId={page.selectedCategoryId}
          setSelectedCategoryId={page.setSelectedCategoryId}
          search={page.search}
          setSearch={page.setSearch}
          statusFilter={page.statusFilter}
          setStatusFilter={page.setStatusFilter}
          openArticle={page.openArticle}
        />

        <ArticleEditorPanel
          selectedId={page.selectedId}
          selected={page.selected}
          form={page.form}
          setForm={page.setForm}
          isReadOnlyView={page.isReadOnlyView}
          isPublished={page.isPublished}
          saving={page.saving}
          error={page.error}
          categories={page.categories}
          groups={page.groups}
          categoryLabelById={page.categoryLabelById}
          attachmentUrls={page.attachmentUrls}
          contentRef={page.contentRef}
          openNew={page.openNew}
          load={page.load}
          openArticle={page.openArticle}
          handleSave={page.handleSave}
          handleSubmitReview={page.handleSubmitReview}
          handleDecision={page.handleDecision}
          insertAtLineStart={page.insertAtLineStart}
          insertAroundSelection={page.insertAroundSelection}
          insertLink={page.insertLink}
          insertImage={page.insertImage}
          insertAttachment={page.insertAttachment}
        />
      </div>
    </>
  );
}
