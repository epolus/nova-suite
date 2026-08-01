/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export default function Card({ children, className = '', padding = true }: Props) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${padding ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}
