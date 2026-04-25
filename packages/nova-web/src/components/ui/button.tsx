/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'warning';
type Size = 'default' | 'sm' | 'icon';

const variantClasses: Record<Variant, string> = {
  default: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700',
  outline: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100',
  secondary: 'bg-gray-100 text-gray-800 shadow-sm hover:bg-gray-200 active:bg-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
  warning: 'bg-amber-500 text-white shadow-sm hover:bg-amber-400 active:bg-amber-600',
};

const sizeClasses: Record<Size, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  icon: 'h-9 w-9',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ className, variant = 'default', size = 'default', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
