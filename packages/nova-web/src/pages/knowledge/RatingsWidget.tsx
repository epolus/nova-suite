/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { knowledge, type KbArticleRatingSummary } from '../../api/client';

export function RatingsWidget({ articleId }: { articleId: string }) {
  const t = useTranslations('pages.knowledge');
  const [rating, setRating] = useState<KbArticleRatingSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    knowledge.ratings(articleId).then(setRating).catch(() => null);
  }, [articleId]);

  const vote = async (r: 1 | -1 | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = rating?.my_rating === r ? null : r;
      const updated = await knowledge.rate(articleId, next);
      setRating(updated);
    } finally {
      setBusy(false);
    }
  };

  if (!rating) return null;

  return (
    <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
      <span className="text-xs text-gray-500">{t('helpfulQuestion')}</span>
      <button
        onClick={() => vote(1)}
        disabled={busy}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          rating.my_rating === 1
            ? 'bg-green-100 border-green-300 text-green-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-200'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17H8.204a1.75 1.75 0 01-1.047-.348L5.93 15.555A1.75 1.75 0 015.5 14.25v-5.5c0-.43.16-.84.448-1.154l4.37-4.68A1.5 1.5 0 0111 3z" />
        </svg>
        {rating.thumbs_up}
      </button>
      <button
        onClick={() => vote(-1)}
        disabled={busy}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          rating.my_rating === -1
            ? 'bg-red-100 border-red-300 text-red-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 rotate-180">
          <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17H8.204a1.75 1.75 0 01-1.047-.348L5.93 15.555A1.75 1.75 0 015.5 14.25v-5.5c0-.43.16-.84.448-1.154l4.37-4.68A1.5 1.5 0 0111 3z" />
        </svg>
        {rating.thumbs_down}
      </button>
    </div>
  );
}
