/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { SearchResult } from '../api/client';
import { AppIcon } from './globalSearchIcons';
import {
  CMD_ICON,
  TYPE_ICON,
  normalizeResultType,
  type NavItem,
  type ParsedCmd,
  type SearchCommand,
} from './globalSearchConfig';

export default function GlobalSearchPanel({
  isHelpCmd,
  isPalette,
  parsed,
  commands,
  selectCommand,
  cmdSuggestions,
  selectedIndex,
  navResults,
  selectNav,
  results,
  isActiveFilter,
  matchedCmd,
  selectResult,
  query,
  loading,
}: {
  isHelpCmd: boolean;
  isPalette: boolean;
  parsed: ParsedCmd | null;
  commands: SearchCommand[];
  selectCommand: (cmd: SearchCommand) => void;
  cmdSuggestions: SearchCommand[];
  selectedIndex: number;
  navResults: NavItem[];
  selectNav: (item: NavItem) => void;
  results: SearchResult[];
  isActiveFilter: boolean;
  matchedCmd: SearchCommand | null;
  selectResult: (r: SearchResult) => void;
  query: string;
  loading: boolean;
}) {
  const t = useTranslations('components.globalSearch');

  const typeLabel = (type: string) => {
    const key = normalizeResultType(type);
    if (key === 'incident' || key === 'change' || key === 'problem' || key === 'knowledge' || key === 'ci') {
      return t(`types.${key}`);
    }
    return t('types.record');
  };

  return (
    <div className="overflow-y-auto flex-1">

      {/* ── Help view ── */}
      {isHelpCmd && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {t('availableCommands')}
          </p>
          {commands.filter(c => c.name !== 'help').map((cmd) => (
            <button
              key={cmd.name}
              onClick={() => selectCommand(cmd)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                <AppIcon name={CMD_ICON[cmd.name] || 'help'} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <kbd className="text-[10px] font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                    /{cmd.name}
                  </kbd>
                  <span className="text-sm font-medium text-gray-800">{cmd.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{cmd.description}</p>
              </div>
            </button>
          ))}
          <div className="px-4 py-3 border-t border-gray-100 mt-1">
            <p className="text-xs text-gray-400">
              {t('helpFooter', { slash: '/', ctrlK: 'Ctrl K' })}
            </p>
          </div>
        </div>
      )}

      {/* ── Command palette ── */}
      {isPalette && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {t('commands')}
          </p>
          {cmdSuggestions.length > 0 ? cmdSuggestions.map((cmd, i) => (
            <button
              key={cmd.name}
              onClick={() => selectCommand(cmd)}
              tabIndex={-1}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedIndex === i ? 'bg-indigo-50' : 'bg-white'
              }`}
            >
              <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                <AppIcon name={CMD_ICON[cmd.name] || 'help'} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    selectedIndex === i ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    /{cmd.name}
                  </kbd>
                  <span className={`text-sm font-medium ${selectedIndex === i ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {cmd.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{cmd.description}</p>
              </div>
              {selectedIndex === i && (
                <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">{t('enterHint')}</span>
              )}
            </button>
          )) : (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              {t('unknownCommand', { help: '/help' })}
            </p>
          )}
        </div>
      )}

      {/* ── Normal mode: Navigation section ── */}
      {!parsed && navResults.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {query ? t('goTo') : t('quickNavigation')}
          </p>
          {navResults.map((item, i) => (
            <button
              key={item.path}
              onClick={() => selectNav(item)}
              tabIndex={-1}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedIndex === i ? 'bg-indigo-50' : 'bg-white'
              }`}
            >
              <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                <AppIcon name={item.icon} />
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${selectedIndex === i ? 'text-indigo-700' : 'text-gray-800'}`}>
                  {item.title}
                </p>
                <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
              </div>
              {selectedIndex === i && (
                <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">{t('enterHint')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Records section (normal + filtered) ── */}
      {results.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {isActiveFilter ? matchedCmd!.label : t('records')}
          </p>
          {results.map((r, i) => {
            const idx = navResults.length + i;
            const resultType = normalizeResultType(r.type);
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => selectResult(r)}
                tabIndex={-1}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  selectedIndex === idx ? 'bg-indigo-50' : 'bg-white'
                }`}
              >
                <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                  <AppIcon name={TYPE_ICON[resultType] ?? 'record'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {typeLabel(resultType)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{r.identifier}</span>
                  </div>
                  <p className={`text-sm font-medium truncate ${selectedIndex === idx ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {r.title}
                  </p>
                  {r.subtitle && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{r.subtitle}</p>
                  )}
                </div>
                {selectedIndex === idx && (
                  <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">{t('enterHint')}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filter — no results */}
      {isActiveFilter && !loading && results.length === 0 && parsed!.term.length >= 1 && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-400">
            {t('noTypeFound', { type: matchedCmd!.label.toLowerCase(), query: parsed!.term })}
          </p>
        </div>
      )}

      {/* Active filter — waiting for term */}
      {isActiveFilter && parsed!.term.length === 0 && (
        <p className="px-4 py-10 text-sm text-gray-400 text-center">
          {t('typeToSearchType', { type: matchedCmd!.label.toLowerCase() })}
        </p>
      )}

      {/* Normal empty state */}
      {!parsed && query.length >= 1 && !loading && results.length === 0 && navResults.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-400">{t('noResultsFor', { query })}</p>
          <p className="text-xs text-gray-400 mt-1">{t('tryDifferentTerm', { slash: '/' })}</p>
        </div>
      )}

      {/* Initial hint */}
      {!parsed && query.length === 0 && navResults.length === 0 && (
        <p className="px-4 py-10 text-sm text-gray-400 text-center">{t('startTyping')}</p>
      )}
    </div>
  );
}
