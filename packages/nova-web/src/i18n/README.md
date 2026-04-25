## Localization structure

This frontend uses `use-intl` (the core library behind `next-intl`) with four locales:

- `en`
- `de`
- `fr`
- `it`

### Files

- `config.ts` — supported locale list, defaults, and validators
- `messages/<locale>.json` — translation messages per locale

### Suggested namespace convention

- `common` — shared labels/actions
- `navigation` — menu entries and sections
- `auth` — login/logout and auth errors
- `pages.<pageName>` — page-specific texts (`pages.incidents`, `pages.requests`, etc.)

### How to add keys

1. Add the key in `messages/en.json`.
2. Add the same key path in `messages/de.json`, `messages/fr.json`, `messages/it.json`.
3. Use `useTranslations('<namespace>')` in components.

Example:

```tsx
const t = useTranslations('common.actions');
<button>{t('save')}</button>
```
