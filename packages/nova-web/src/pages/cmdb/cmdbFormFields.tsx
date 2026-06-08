/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import type { CIAttrDef } from './cmdbHelpers';

export type UserOption = { id: string; display_name: string; email: string };
export type RefOption = { id: string; label: string };
export type RefDataMap = Record<string, RefOption[]>;

export function UserPicker({ users, value, onChange, placeholder }: {
  users: UserOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const tStates = useTranslations('common.states');
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{placeholder || tStates('none')}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>
      ))}
    </select>
  );
}

export function CiAttributeFields({ classAttrs, className, attributes, setAttributes, refData }: {
  classAttrs: Record<string, CIAttrDef>;
  className: string;
  attributes: Record<string, string>;
  setAttributes: (next: Record<string, string>) => void;
  refData: RefDataMap;
}) {
  const tCmdb = useTranslations('pages.cmdb');
  const tStates = useTranslations('common.states');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">
        {tCmdb('classAttributes', { className })}
        <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
          {Object.keys(classAttrs).length}
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(classAttrs).map(([attrName, attrDef]) => {
          const attrType = (attrDef as any)?.type || 'string';
          const refTable = (attrDef as any)?.reference_table;
          const refLabel = refTable === 'users' ? tCmdb('refTables.users')
            : refTable === 'assignment_groups' ? tCmdb('refTables.assignmentGroups')
              : refTable === 'departments' ? tCmdb('refTables.departments')
                : refTable === 'cost_centers' ? tCmdb('refTables.costCenters')
                  : refTable === 'services' ? tCmdb('refTables.services')
                    : refTable;
          return (
            <div key={attrName}>
              <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">
                {attrName.replace(/_/g, ' ')}
                <span className="ml-1 text-gray-300 font-normal">
                  ({attrType === 'reference' ? tCmdb('refLabel', { table: refLabel }) : attrType})
                </span>
              </label>
              {attrType === 'reference' && refTable ? (
                <select
                  value={attributes[attrName] || ''}
                  onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{tStates('none')}</option>
                  {(refData[refTable] || []).map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              ) : attrType === 'boolean' ? (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={attributes[attrName] === 'true'}
                    onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                  />
                  {attrName.replace(/_/g, ' ')}
                </label>
              ) : attrType === 'number' || attrType === 'integer' ? (
                <input
                  type="number"
                  value={attributes[attrName] || ''}
                  onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <input
                  type="text"
                  value={attributes[attrName] || ''}
                  onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={tCmdb('enterAttribute', { name: attrName.replace(/_/g, ' ') })}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
