/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTheme } from '../context/ThemeContext';

type Variant = 'on-dark-header' | 'on-light-header';

interface Props {
  variant?: Variant;
}

export default function DarkModeToggle({ variant = 'on-light-header' }: Props) {
  const { isDark, toggleDark } = useTheme();
  const trackOff =
    variant === 'on-dark-header'
      ? 'bg-white/15 hover:bg-white/20'
      : 'bg-gray-200 hover:bg-gray-300';
  const trackOn = 'ring-2 ring-white/30';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        variant === 'on-dark-header' ? 'focus-visible:ring-white/50 focus-visible:ring-offset-slate-900' : 'focus-visible:ring-indigo-500 focus-visible:ring-offset-white'
      } ${isDark ? `${trackOn}` : trackOff}`}
      style={
        isDark
          ? { backgroundColor: 'var(--color-primary)' }
          : undefined
      }
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
          isDark ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
