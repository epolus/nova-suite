/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAssign: boolean;
  canResolve: boolean;
  canReopen: boolean;
  canEscalate: boolean;
  canLink: boolean;
  canTemplate: boolean;
  canClose: boolean;
  canQueue: boolean;
  problems: Array<{ id: string; number: string; title: string }>;
  onAction: (action: 'global-search' | 'assign' | 'resolve' | 'reopen' | 'escalate' | 'templates' | 'close' | 'queue-next' | 'queue-prev') => void;
  onLinkProblem: (problemId: string) => void;
};

export default function WorkbenchCommandPalette({
  open,
  onOpenChange,
  canAssign,
  canResolve,
  canReopen,
  canEscalate,
  canLink,
  canTemplate,
  canClose,
  canQueue,
  problems,
  onAction,
  onLinkProblem,
}: Props) {
  const t = useTranslations('pages.workbench');

  const run = (action: Parameters<Props['onAction']>[0]) => {
    onOpenChange(false);
    onAction(action);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t('commands')} description={t('shortcutHint')}>
      <CommandInput placeholder={t('commands')} />
      <CommandList>
        <CommandEmpty>{t('noCommands')}</CommandEmpty>
        <CommandGroup heading={t('commands')}>
          <CommandItem onSelect={() => run('global-search')}>
            {t('globalSearch')}
            <CommandShortcut>Ctrl+K</CommandShortcut>
          </CommandItem>
          <CommandItem disabled={!canAssign} onSelect={() => run('assign')}>{t('assignToMe')}</CommandItem>
          <CommandItem disabled={!canResolve} onSelect={() => run('resolve')}>{t('resolve')}</CommandItem>
          <CommandItem disabled={!canReopen} onSelect={() => run('reopen')}>{t('reopen')}</CommandItem>
          <CommandItem disabled={!canEscalate} onSelect={() => run('escalate')}>{t('escalate')}</CommandItem>
          <CommandItem disabled={!canTemplate} onSelect={() => run('templates')}>{t('templates')}</CommandItem>
          <CommandItem disabled={!canClose} onSelect={() => run('close')}>{t('closeTab')}</CommandItem>
          <CommandItem disabled={!canQueue} onSelect={() => run('queue-prev')}>
            {t('prevQueue')}
            <CommandShortcut>K</CommandShortcut>
          </CommandItem>
          <CommandItem disabled={!canQueue} onSelect={() => run('queue-next')}>
            {t('nextQueue')}
            <CommandShortcut>J</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {canLink && (
          <CommandGroup heading={t('linkProblem')}>
            {problems.slice(0, 30).map((problem) => (
              <CommandItem
                key={problem.id}
                value={`${problem.number} ${problem.title}`}
                onSelect={() => {
                  onOpenChange(false);
                  onLinkProblem(problem.id);
                }}
              >
                {problem.number} {problem.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
