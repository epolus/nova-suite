/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { DragEvent, RefObject } from 'react';
import type { Attachment } from '../api/client';
import Card from './Card';
import { formatDateTime } from '../utils/dateTime';

interface Props {
  attachments: Attachment[];
  uploading: boolean;
  dragOver: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  previewUrl: string | null;
  previewName: string;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onClickZone: () => void;
  onFileChange: (files: File[]) => void;
  onPreview: (att: Attachment) => void;
  onDownload: (att: Attachment) => void;
  onDelete: (id: string) => void;
  onClosePreview: () => void;
  formatSize: (bytes: number) => string;
}

function AttachmentRow({ att, onPreview, onDownload, onDelete, formatSize }: {
  att: Attachment;
  onPreview: (att: Attachment) => void;
  onDownload: (att: Attachment) => void;
  onDelete: (id: string) => void;
  formatSize: (bytes: number) => string;
}) {
  const t = useTranslations('components.attachmentCard');
  const icon = att.mime_type.startsWith('image/') ? '📷' : att.mime_type.includes('pdf') ? '📄' : '📎';
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 group">
      <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-base flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <button onClick={() => onPreview(att)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 truncate block text-left w-full">
          {att.file_name}
        </button>
        <p className="text-xs text-gray-400">
          {formatSize(att.size_bytes)} · {att.uploaded_by_name || att.uploaded_by} · {formatDateTime(att.created_at)}
        </p>
      </div>
      <button onClick={() => onDownload(att)} className="text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" title={t('download')}>&#8681;</button>
      <button onClick={() => onDelete(att.id)} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title={t('delete')}>&#10005;</button>
    </div>
  );
}

export function AttachmentCard({
  attachments, uploading, dragOver, fileInputRef,
  previewUrl, previewName,
  onDragOver, onDragLeave, onDrop, onClickZone, onFileChange,
  onPreview, onDownload, onDelete, onClosePreview, formatSize,
}: Props) {
  const t = useTranslations('components.attachmentCard');

  return (
    <>
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">
          {t('title')}
          {attachments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">({attachments.length})</span>
          )}
        </h3>
        <div
          onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onClickZone}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors mb-4 ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onFileChange(Array.from(e.target.files))}
          />
          {uploading ? (
            <p className="text-sm text-indigo-600 font-medium">{t('uploading')}</p>
          ) : (
            <>
              <p className="text-sm text-gray-500">{t('dropHint')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('sizeHint')}</p>
            </>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                att={att}
                onPreview={onPreview}
                onDownload={onDownload}
                onDelete={onDelete}
                formatSize={formatSize}
              />
            ))}
          </div>
        )}
        {attachments.length === 0 && !uploading && (
          <p className="text-sm text-gray-400 text-center py-2">{t('empty')}</p>
        )}
      </Card>

      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={onClosePreview}>
          <div className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white text-sm font-medium">{previewName}</span>
              <button onClick={onClosePreview} className="text-white/70 hover:text-white text-lg">&#10005;</button>
            </div>
            <img src={previewUrl} alt={previewName} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}
