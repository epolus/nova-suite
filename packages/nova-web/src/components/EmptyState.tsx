/* SPDX-License-Identifier: AGPL-3.0-only */
export default function EmptyState({ message = 'No data found' }: { message?: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );
}
