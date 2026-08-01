/* SPDX-License-Identifier: AGPL-3.0-only */
interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, description, action }: Props) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
