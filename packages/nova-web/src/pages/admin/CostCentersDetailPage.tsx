/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type CostCenterItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function CostCentersDetailPage() {
  const t = useTranslations('pages.admin.costCenters');
  const tFields = useTranslations('common.fields');

  const fields = useMemo((): FieldDef[] => [
    { key: 'code', label: tFields('code'), type: 'text', required: true, placeholder: t('placeholderCode') },
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.costCenters();
    return res.cost_centers;
  }, []);

  return (
    <MasterDataDetailPage<CostCenterItem>
      title={t('title')}
      basePath="/admin/cost-centers"
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createCostCenter(data as { code: string; name: string; description?: string })}
      updateItem={(id, data) => admin.updateCostCenter(id, data)}
      getDefaults={(item) => ({
        code: item?.code ?? '',
        name: item?.name ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
