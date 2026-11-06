/* SPDX-License-Identifier: AGPL-3.0-only */
import { useLocation, useParams } from 'react-router';
import DataManagementDetailView from './DataManagementDetailView';
import DataManagementFormView from './DataManagementFormView';
import DataManagementListView from './DataManagementListView';

export default function DataManagementPage() {
  const { pathname } = useLocation();
  const { id } = useParams<{ id?: string }>();
  if (pathname === '/admin/data-management/new') return <DataManagementFormView />;
  if (id) return <DataManagementDetailView id={id} />;
  return <DataManagementListView />;
}
