/* SPDX-License-Identifier: AGPL-3.0-only */
import { useStatusLabel } from '@/i18n/hooks';

const colorMap: Record<string, string> = {
  // Statuses
  new: 'bg-blue-100 text-blue-800',
  submitted: 'bg-blue-100 text-blue-800',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  pending: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  fulfilled: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-500',
  major_incident_manager: 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100',
  // Major incident statuses
  pending_acceptance: 'bg-yellow-100 text-yellow-900',
  declared: 'bg-orange-100 text-orange-900',
  investigating: 'bg-indigo-100 text-indigo-800',
  monitoring: 'bg-amber-100 text-amber-900',
  // Priorities
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
  // KB article statuses
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-yellow-100 text-yellow-800',
  published: 'bg-emerald-100 text-emerald-800',
  // CI status
  active: 'bg-green-100 text-green-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  retired: 'bg-gray-100 text-gray-500',
  planned: 'bg-blue-100 text-blue-800',
  // Environments
  production: 'bg-red-100 text-red-700',
  staging: 'bg-yellow-100 text-yellow-700',
  development: 'bg-blue-100 text-blue-700',
  test: 'bg-gray-100 text-gray-700',
  // Relationship types
  depends_on: 'bg-red-100 text-red-700',
  used_by: 'bg-blue-100 text-blue-700',
  runs_on: 'bg-purple-100 text-purple-700',
  connected_to: 'bg-cyan-100 text-cyan-700',
  part_of: 'bg-orange-100 text-orange-700',
  manages: 'bg-green-100 text-green-700',
};

export default function Badge({ value, className = '' }: { value: string; className?: string }) {
  const statusLabel = useStatusLabel();
  const color = colorMap[value] || 'bg-gray-100 text-gray-800';
  const label = statusLabel(value);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${color} ${className}`}
    >
      {label}
    </span>
  );
}
