/* SPDX-License-Identifier: AGPL-3.0-only */
export type ChecklistOption = { id: string; label: string; secondary?: string };

export default function ChecklistFieldset({
  legend,
  options,
  selectedIds,
  onToggle,
  emptyMessage,
}: {
  legend: string;
  options: ChecklistOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyMessage?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700 mb-3">{legend}</legend>
      <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
        {options.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(opt.id)}
              onChange={() => onToggle(opt.id)}
              className="rounded text-indigo-600"
            />
            <span className="text-gray-800">{opt.label}</span>
            {opt.secondary !== undefined && (
              <span className="text-gray-400 text-xs ml-auto">{opt.secondary}</span>
            )}
          </label>
        ))}
        {options.length === 0 && emptyMessage && (
          <p className="text-xs text-gray-400 text-center py-2">{emptyMessage}</p>
        )}
      </div>
    </fieldset>
  );
}
