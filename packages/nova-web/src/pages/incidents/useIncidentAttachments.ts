/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useRef } from 'react';
import { attachments as attachmentsApi } from '../../api/client';
import type { Attachment } from '../../api/client';
import { formatAttachmentSize } from './incidentDetailFields';

export function useIncidentAttachments(id: string | undefined) {
  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!id) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const att = await attachmentsApi.upload('incident', id, file);
          setFileAttachments((prev) => [att, ...prev]);
        }
      } finally {
        setUploading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (!id) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const filesToUpload: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const name =
              file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
            filesToUpload.push(new File([file], name, { type: file.type }));
          }
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        await handleFileUpload(filesToUpload);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [id, handleFileUpload]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await handleFileUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    await attachmentsApi.delete(attId);
    setFileAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handlePreview = async (att: Attachment) => {
    if (att.mime_type.startsWith('image/')) {
      const url = await attachmentsApi.previewUrl(att.id);
      setPreviewUrl(url);
      setPreviewName(att.file_name);
    } else {
      await attachmentsApi.download(att.id, att.file_name);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return {
    fileAttachments,
    setFileAttachments,
    uploading,
    dragOver,
    setDragOver,
    fileInputRef,
    previewUrl,
    previewName,
    closePreview,
    handleFileUpload,
    handleDrop,
    handleDeleteAttachment,
    handlePreview,
    formatSize: formatAttachmentSize,
  };
}
