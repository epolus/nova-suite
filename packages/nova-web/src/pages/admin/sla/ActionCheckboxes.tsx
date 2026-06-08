/* SPDX-License-Identifier: AGPL-3.0-only */

interface ActionCheckboxesProps {
  label: string;
  available: { id: string; label: string; description: string }[];
  selected: string[];
  onChange: (actions: string[]) => void;
}

export default function ActionCheckboxes({
  label,
  available,
  selected,
  onChange,
}: ActionCheckboxesProps) {
  const toggle = (actionId: string) => {
    if (selected.includes(actionId)) {
      onChange(selected.filter((a) => a !== actionId));
    } else {
      onChange([...selected, actionId]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {available.map((action) => (
          <label
            key={action.id}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selected.includes(action.id)
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(action.id)}
              onChange={() => toggle(action.id)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">{action.label}</span>
              <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
