/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { catalog, type Category } from '../../api/client';
import { CatalogItemIcon } from './catalogItemIcons';
import { isCatalogItemIcon } from './catalogItemIconSet';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

function categoryPayload(data: Record<string, unknown>, invalidSortOrder: string) {
  const description = String(data.description ?? '').trim();
  const icon = String(data.icon ?? '').trim();
  const sortRaw = String(data.sort_order ?? '').trim();
  if (sortRaw && !/^\d+$/.test(sortRaw)) throw new Error(invalidSortOrder);
  return {
    name: String(data.name ?? '').trim(),
    description: description || null,
    icon: icon || 'folder',
    sort_order: sortRaw ? Number(sortRaw) : 0,
  };
}

export default function CategoriesPage() {
  const t = useTranslations('pages.admin.categories');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const columns = useMemo((): ColumnDef<Category>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (category) => <span className="font-medium text-gray-900">{category.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (category) => (
        <span className="text-gray-500">{category.description || tTable('emDash')}</span>
      ),
      className: 'max-w-xs truncate',
    },
    {
      key: 'icon',
      label: tFields('icon'),
      sortable: true,
      render: (category) => isCatalogItemIcon(category.icon) ? (
        <span title={category.icon} className="inline-flex text-gray-600">
          <CatalogItemIcon name={category.icon} className="size-4" />
        </span>
      ) : (
        <span className="text-gray-500">{category.icon || tTable('emDash')}</span>
      ),
    },
    {
      key: 'sort_order',
      label: t('sortOrder'),
      sortable: true,
      render: (category) => <span className="text-gray-600">{category.sort_order}</span>,
    },
    {
      key: 'item_count',
      label: t('items'),
      sortable: true,
      render: (category) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {category.item_count ?? 0}
        </span>
      ),
    },
  ], [t, tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
    { key: 'icon', label: tFields('icon'), type: 'text', placeholder: t('placeholderIcon') },
    { key: 'sort_order', label: t('sortOrder'), type: 'text', placeholder: '0' },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await catalog.categories({ includeInactive: true });
    return res.categories;
  }, []);

  const invalidSortOrder = t('sortOrderInvalid');

  return (
    <MasterDataPage<Category>
      title={t('title')}
      description={t('description')}
      entityLabel={t('entity')}
      storageKey="admin_categories"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => {
        const payload = categoryPayload(data, invalidSortOrder);
        return catalog.createCategory({
          name: payload.name,
          ...(payload.description ? { description: payload.description } : {}),
          icon: payload.icon,
          sort_order: payload.sort_order,
        });
      }}
      updateItem={(id, data) => {
        const payload = categoryPayload(data, invalidSortOrder);
        return catalog.updateCategory(id, {
          ...payload,
          is_active: Boolean(data.is_active),
        });
      }}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
        icon: item?.icon ?? 'folder',
        sort_order: item ? String(item.sort_order) : '0',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q)
        || (item.description?.toLowerCase().includes(q) ?? false)
        || item.icon.toLowerCase().includes(q)
      }
    />
  );
}
