/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

/** Shared content panel used by list/detail layouts. */
export default function Card({ children, className = '', padding = true }: Props) {
  return (
    <div
      data-nova-card=""
      className={`bg-white rounded-xl shadow-xs border border-gray-200 ${padding ? 'p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
