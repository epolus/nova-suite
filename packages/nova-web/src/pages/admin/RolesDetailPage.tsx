/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type RoleItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function RolesDetailPage() {
  const t = useTranslations('pages.admin.roles');
  const tFields = useTranslations('common.fields');

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.roles();
    return res.roles;
  }, []);

  return (
    <MasterDataDetailPage<RoleItem>
      title={t('title')}
      basePath="/admin/roles"
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createRole(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateRole(id, data)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
