/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, Ref, SetStateAction } from 'react';
import { useTranslations } from 'use-intl';
import {
  knowledge,
  type AssignmentGroupItem,
  type KnowledgeArticle,
  type KnowledgeArticleDetail,
  type KnowledgeCategory,
} from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { renderMarkdown } from './knowledgeMarkdown';
import { RatingsWidget } from './RatingsWidget';
import type { KnowledgeForm } from './knowledgeSections';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
const toolbarBtnCls = 'px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-mono text-gray-700';

export function ArticleEditorPanel({
  selectedId,
  selected,
  form,
  setForm,
  isReadOnlyView,
  isPublished,
  saving,
  error,
  categories,
  groups,
  categoryLabelById,
  attachmentUrls,
  contentRef,
  openNew,
  load,
  openArticle,
  handleSave,
  handleSubmitReview,
  handleDecision,
  insertAtLineStart,
  insertAroundSelection,
  insertLink,
  insertImage,
  insertAttachment,
}: {
  selectedId: string | 'new' | null;
  selected: KnowledgeArticleDetail | null;
  form: KnowledgeForm;
  setForm: Dispatch<SetStateAction<KnowledgeForm>>;
  isReadOnlyView: boolean;
  isPublished: boolean;
  saving: boolean;
  error: string;
  categories: KnowledgeCategory[];
  groups: AssignmentGroupItem[];
  categoryLabelById: Map<string, string>;
  attachmentUrls: Record<string, string>;
  contentRef: Ref<HTMLTextAreaElement>;
  openNew: () => void;
  load: () => Promise<void>;
  openArticle: (id: string) => Promise<void>;
  handleSave: () => void;
  handleSubmitReview: () => void;
  handleDecision: (approvalId: string, decision: 'approved' | 'rejected') => void;
  insertAtLineStart: (prefix: string) => void;
  insertAroundSelection: (before: string, after?: string) => void;
  insertLink: () => void;
  insertImage: () => void;
  insertAttachment: () => void;
}) {
  const t = useTranslations('pages.knowledge');
  const tActions = useTranslations('common.actions');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();

  if (!selectedId) {
    return (
      <div className="lg:col-span-3">
        <Card>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">{t('noArticleSelected')}</p>
            <p className="text-xs text-gray-400 mb-4">
              {t('selectOrCreate', { createHint: !isReadOnlyView ? t('selectOrCreateHint') : '' })}
            </p>
            {!isReadOnlyView && <Button onClick={openNew}>+ {t('newArticle')}</Button>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="lg:col-span-3">
      <Card>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {selected ? (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-gray-400">{selected.number}</span>
                  <Badge value={selected.status} />
                  {selected.version_no && (
                    <span className="text-xs text-gray-400">v{selected.version_no}</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-0.5">{t('newArticle')}</p>
              )}
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {form.title || t('untitled')}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isReadOnlyView && selectedId !== 'new' && isPublished && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (isReadOnlyView) return;
                    if (!selectedId || selectedId === 'new') return;
                    const created = await knowledge.newVersion(selectedId);
                    await load();
                    await openArticle(created.id);
                  }}
                >
                  {t('newVersion')}
                </Button>
              )}
              {selectedId !== 'new' && !isPublished && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSubmitReview}
                  disabled={saving}
                >
                  {t('submitForReview')}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || isPublished || !form.title || !form.content}
              >
                {saving ? tActions('saving') : selectedId === 'new' ? tActions('create') : isPublished ? t('readOnly') : tActions('save')}
              </Button>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          {/* ── Article Details ── */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('articleDetails')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>{fieldLabel('title')}</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t('titlePlaceholder')}
                  className={inputCls}
                  readOnly={isPublished}
                />
              </div>
              <div>
                <label className={labelCls}>{fieldLabel('category')}</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
                  className={inputCls}
                  disabled={isPublished}
                >
                  <option value="">{t('noCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{categoryLabelById.get(c.id) || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{fieldLabel('assignmentGroup')}</label>
                <select
                  value={form.assignment_group_id}
                  onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))}
                  className={inputCls}
                  disabled={isPublished}
                >
                  <option value="">{t('noAssignmentGroup')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              {!isPublished && selectedId !== 'new' && (
                <div>
                  <label className={labelCls}>{fieldLabel('status')}</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as KnowledgeArticle['status'] }))}
                    className={inputCls}
                  >
                    <option value="draft">{statusLabel('draft')}</option>
                    <option value="review">{statusLabel('review')}</option>
                    <option value="published">{statusLabel('published')}</option>
                    <option value="retired">{statusLabel('retired')}</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Content ── */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('content')}</h3>

            {isPublished ? (
              <div className="space-y-4">
                <div className="w-full min-h-[260px] px-4 py-4 border border-gray-200 rounded-lg text-sm prose max-w-none bg-gray-50/40">
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                </div>
                {selected && <RatingsWidget articleId={selected.id} />}
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1 mb-2 p-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <button type="button" onClick={() => insertAroundSelection('**', '**')} className={toolbarBtnCls} title={t('toolbar.bold')}><strong>B</strong></button>
                  <button type="button" onClick={() => insertAroundSelection('*', '*')} className={`${toolbarBtnCls} italic`} title={t('toolbar.italic')}>I</button>
                  <span className="w-px h-4 bg-gray-300 mx-0.5" />
                  <button type="button" onClick={() => insertAtLineStart('# ')} className={toolbarBtnCls} title={t('toolbar.h1')}>H1</button>
                  <button type="button" onClick={() => insertAtLineStart('## ')} className={toolbarBtnCls} title={t('toolbar.h2')}>H2</button>
                  <button type="button" onClick={() => insertAtLineStart('### ')} className={toolbarBtnCls} title={t('toolbar.h3')}>H3</button>
                  <span className="w-px h-4 bg-gray-300 mx-0.5" />
                  <button type="button" onClick={() => insertAtLineStart('- ')} className={toolbarBtnCls} title={t('toolbar.bulletList')}>UL</button>
                  <button type="button" onClick={() => insertAtLineStart('1. ')} className={toolbarBtnCls} title={t('toolbar.numberedList')}>OL</button>
                  <span className="w-px h-4 bg-gray-300 mx-0.5" />
                  <button type="button" onClick={() => insertAroundSelection('`', '`')} className={toolbarBtnCls} title={t('toolbar.inlineCode')}>{'`'}</button>
                  <button type="button" onClick={() => insertAroundSelection('```\n', '\n```')} className={toolbarBtnCls} title={t('toolbar.codeBlock')}>```</button>
                  <span className="w-px h-4 bg-gray-300 mx-0.5" />
                  <button type="button" onClick={insertLink} className={toolbarBtnCls} title={t('toolbar.link')}>Link</button>
                  <button type="button" onClick={insertImage} className={toolbarBtnCls} title={t('toolbar.image')}>Image</button>
                  <button type="button" onClick={insertAttachment} className={toolbarBtnCls} title={t('toolbar.attach')}>Attach</button>
                  <button type="button" onClick={() => insertAtLineStart('---')} className={toolbarBtnCls} title={t('toolbar.horizontalRule')}>HR</button>
                </div>

                {/* Split pane */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <textarea
                    ref={contentRef}
                    value={form.content}
                    onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                    rows={20}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono resize-none"
                    placeholder={t('markdownPlaceholder')}
                  />
                  <div className="hidden lg:block">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">{t('preview')}</p>
                    <div className="w-full h-[calc(100%-24px)] min-h-[300px] px-4 py-3 border border-gray-200 rounded-lg text-sm bg-gray-50/40 overflow-y-auto">
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                    </div>
                  </div>
                  <div className="lg:hidden">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">{t('preview')}</p>
                    <div className="w-full min-h-[180px] px-4 py-3 border border-gray-200 rounded-lg text-sm bg-gray-50/40">
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Versions ── */}
          {selected?.versions?.length ? (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{t('versions')}</h3>
              <div className="flex flex-wrap gap-2">
                {selected.versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openArticle(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      v.id === selected.id
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {v.number} · v{v.version_no} · <Badge value={v.status} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Approvals ── */}
          {selected?.approvals?.length ? (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{t('approvalSteps')}</h3>
              <div className="space-y-2">
                {selected.approvals.map((ap) => (
                  <div key={ap.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50/40">
                    <span className="text-xs text-gray-400">{t('step', { order: ap.step_order })}</span>
                    <span className="text-sm font-medium text-gray-800">{ap.assignment_group_name}</span>
                    <Badge value={ap.status} />
                    {ap.status === 'pending' && (
                      <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" onClick={() => handleDecision(ap.id, 'approved')} className="bg-green-600 hover:bg-green-700">
                          {tActions('approve')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDecision(ap.id, 'rejected')} className="text-red-600 border-red-200 hover:bg-red-50">
                          {tActions('reject')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Metadata footer ── */}
          {selected && (
            <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
              <span>{t('metadataNumber')} <span className="text-gray-600">{selected.number}</span></span>
              <span>{t('metadataViews')} <span className="text-gray-600">{selected.view_count}</span></span>
              <span>{t('metadataGroup')} <span className="text-gray-600">{selected.assignment_group_name || t('none')}</span></span>
              <span>{t('metadataUpdated')} <span className="text-gray-600">{formatDateTime(selected.updated_at)}</span></span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
