/* SPDX-License-Identifier: AGPL-3.0-only */
import type { IncidentCategory } from '../../api/client';
import { useFieldLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { INCIDENT_FIELD } from './incidentDetailShared';
import {
  childIncidentCategories,
  leafCategoryId,
  rootIncidentCategories,
  splitCategorySelection,
} from './incidentClassification';

type Props = {
  readonly: boolean;
  category: string;
  subcategory: string;
  categoryId: string;
  legacyCategory: string | null;
  legacySubcategory: string | null;
  incidentCategories: IncidentCategory[];
  inputCls: string;
  selectCls: string;
  setField: (key: string, val: string) => void;
};

export function IncidentCategoryFields({
  readonly,
  category,
  subcategory,
  categoryId,
  legacyCategory,
  legacySubcategory,
  incidentCategories,
  inputCls,
  selectCls,
  setField,
}: Props) {
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const activeCategories = incidentCategories.filter((c) => c.is_active || c.id === categoryId);
  const { rootId, childId } = splitCategorySelection(activeCategories, categoryId);
  const rootOptions = rootIncidentCategories(activeCategories);
  const childOptions = childIncidentCategories(activeCategories, rootId);
  const setCategoryLeaf = (nextRootId: string, nextChildId: string) => {
    setField('categoryId', leafCategoryId(nextRootId, nextChildId) || '');
  };

  return (
    <>
      <div>
        <dt id={`${INCIDENT_FIELD.category}-label`} className="text-gray-500">{fieldLabel('category')}</dt>
        <dd className="text-gray-900 mt-0.5">
          {readonly ? (
            legacyCategory || tTable('emDash')
          ) : rootOptions.length > 0 ? (
            <select
              id={INCIDENT_FIELD.category}
              name={INCIDENT_FIELD.category}
              value={rootId}
              onChange={(e) => setCategoryLeaf(e.target.value, '')}
              className={selectCls}
              aria-labelledby={`${INCIDENT_FIELD.category}-label`}
            >
              <option value="">{tTable('emDash')}</option>
              {rootOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              id={INCIDENT_FIELD.category}
              name={INCIDENT_FIELD.category}
              type="text"
              value={category}
              onChange={(e) => setField('category', e.target.value)}
              placeholder={fieldLabel('category')}
              className={inputCls}
              aria-labelledby={`${INCIDENT_FIELD.category}-label`}
            />
          )}
        </dd>
      </div>
      <div>
        <dt id={`${INCIDENT_FIELD.subcategory}-label`} className="text-gray-500">{fieldLabel('subcategory')}</dt>
        <dd className="text-gray-900 mt-0.5">
          {readonly ? (
            legacySubcategory || tTable('emDash')
          ) : rootOptions.length > 0 ? (
            <select
              id={INCIDENT_FIELD.subcategory}
              name={INCIDENT_FIELD.subcategory}
              value={childId}
              onChange={(e) => setCategoryLeaf(rootId, e.target.value)}
              className={selectCls}
              aria-labelledby={`${INCIDENT_FIELD.subcategory}-label`}
              disabled={!rootId || childOptions.length === 0}
            >
              <option value="">{tTable('emDash')}</option>
              {childOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              id={INCIDENT_FIELD.subcategory}
              name={INCIDENT_FIELD.subcategory}
              type="text"
              value={subcategory}
              onChange={(e) => setField('subcategory', e.target.value)}
              placeholder={fieldLabel('subcategory')}
              className={inputCls}
              aria-labelledby={`${INCIDENT_FIELD.subcategory}-label`}
            />
          )}
        </dd>
      </div>
    </>
  );
}
