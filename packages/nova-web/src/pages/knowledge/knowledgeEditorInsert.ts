/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { attachments } from '../../api/client';
import type { KnowledgeArticle } from '../../api/client';

type KnowledgeFormState = {
  title: string;
  content: string;
  category_id: string;
  assignment_group_id: string;
  status: KnowledgeArticle['status'];
};

type FormSetter = Dispatch<SetStateAction<KnowledgeFormState>>;

export function createKnowledgeEditorInsertHandlers(
  contentRef: RefObject<HTMLTextAreaElement | null>,
  formContent: string,
  setForm: FormSetter,
  selectedId: string | 'new' | null,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  const insertAtLineStart = (prefix: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const lineStart = formContent.lastIndexOf('\n', start - 1) + 1;
    const next = `${formContent.slice(0, lineStart)}${prefix}${formContent.slice(lineStart)}`;
    setForm((p) => ({ ...p, content: next }));
    setTimeout(() => { el.focus(); const pos = start + prefix.length; el.setSelectionRange(pos, pos); }, 0);
  };

  const insertAroundSelection = (before: string, after = '') => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selectedText = formContent.slice(start, end);
    const next = `${formContent.slice(0, start)}${before}${selectedText}${after}${formContent.slice(end)}`;
    setForm((p) => ({ ...p, content: next }));
    setTimeout(() => {
      el.focus();
      const pos = start + before.length + selectedText.length + after.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertLink = () => insertAroundSelection('[link text](', ')');

  const insertImage = async () => {
    if (!selectedId || selectedId === 'new') { setError(t('createFirstForImages')); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const uploaded = await attachments.upload('knowledge_article', selectedId, file);
        insertAroundSelection(`![${file.name}](attachment:${uploaded.id})`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('uploadImageFailed'));
      }
    };
    input.click();
  };

  const insertAttachment = async () => {
    if (!selectedId || selectedId === 'new') { setError(t('createFirstForAttachments')); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const uploaded = await attachments.upload('knowledge_article', selectedId, file);
        insertAroundSelection(`[${file.name}](attachment:${uploaded.id})`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('uploadAttachmentFailed'));
      }
    };
    input.click();
  };

  return {
    insertAtLineStart,
    insertAroundSelection,
    insertLink,
    insertImage,
    insertAttachment,
  };
}
