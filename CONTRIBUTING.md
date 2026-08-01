# Contributing to Nova Suite

## nova-web page template

When adding or refactoring pages in `packages/nova-web`, follow these conventions:

### List pages

- Use [`useListParams`](packages/nova-web/src/hooks/useListParams.ts) for search, sort, filters, and column visibility (synced to URL + preferences).
- Use [`DataTable`](packages/nova-web/src/components/DataTable.tsx) for tabular data with pagination and bulk actions.
- Use [`PageHeader`](packages/nova-web/src/components/PageHeader.tsx) for consistent page chrome.
- Extract list constants to a `*ListConfig.ts` file alongside the page (see `incidentListConfig.ts`).
- Prefer TanStack Query hooks from `hooks/queries/` for server state instead of raw `useEffect` + `fetch`.

### Detail pages

- Extract data loading and mutations into a `use*Detail.ts` hook (see `useIncidentDetail.ts`).
- Keep the page component focused on layout and presentation.
- Use `components/ui/` primitives (`Button`, `Card`) for new UI; avoid raw `<button>` and legacy `Card.tsx` in new code.

### Admin CRUD

- For simple master data, wrap [`MasterDataPage`](packages/nova-web/src/pages/admin/MasterDataPage.tsx) with a thin config page (see `DepartmentsPage.tsx`).

### API changes

- Add new endpoints under `src/api/domains/`, not in a monolithic file.
- Types belong in `src/api/types/`.
- Re-export from `src/api/client.ts` for backward compatibility.

### Imports

- Use the `@/` path alias (e.g. `@/components/DataTable`).

### File size

- ESLint warns at 400 lines. Split large files into hooks, subcomponents, or domain folders before they grow further.

### Styling

- Use Tailwind `dark:` variants for dark mode support in new components.
- Avoid adding light-only utility overrides to `index.css`.

### i18n

- Add keys to all locale files under `src/i18n/messages/`.
- Use `useTranslations('<namespace>')` from `use-intl`.
