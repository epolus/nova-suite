## Localization structure

This frontend uses `use-intl` with five locales:

- `en`
- `de`
- `de-ch`
- `fr`
- `it`

### Files

- `config.ts` — supported locale list, defaults, and validators
- `mergeMessages.ts` — deep-merges `en` as fallback for non-English locales
- `hooks.ts` — `useStatusLabel`, `usePriorityLabel`, `useFieldLabel`, etc.
- `messages/en.json` — source of truth for all UI keys (option C migration)
- `messages/<locale>.json` — partial translations; missing keys fall back to English

### Namespace convention

- `common` — shared labels, actions, table, list, master data
- `navigation` — menu entries and sections
- `auth` — login/logout and auth errors
- `pages.<pageName>` — page-specific texts
- `components.<name>` — shared component strings
- `status`, `priority`, `impact`, `urgency` — enum labels for badges and filters
- `errors` — generic error messages

### Adding keys (option C workflow)

1. Add the key in `messages/en.json` only.
2. Use `useTranslations('<namespace>')` in components.
3. Translate other locales later; until then English is shown via `mergeMessages`.

Example:

```tsx
const t = useTranslations('common.actions');
<button>{t('save')}</button>
```

### Label hooks

```tsx
import { useStatusLabel, useFieldLabel } from '@/i18n/hooks';

const statusLabel = useStatusLabel();
const fieldLabel = useFieldLabel();
```
