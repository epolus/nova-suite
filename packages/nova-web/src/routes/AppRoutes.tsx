/* SPDX-License-Identifier: AGPL-3.0-only */
import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import ESSLayout from '@/components/ESSLayout';
import Spinner from '@/components/Spinner';
import Login from '@/pages/Login';
import AdminAccessGuard from '@/components/AdminAccessGuard';
import { isAgentRole } from '@/utils/roles';
import * as Pages from './lazyPages';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SmartLayout() {
  const { user } = useAuth();
  return isAgentRole(user?.roles) ? <Layout /> : <ESSLayout />;
}

function SmartHome() {
  const { user } = useAuth();
  return isAgentRole(user?.roles) ? <Pages.Dashboard /> : <Navigate to="/ess" replace />;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}

export default function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <SmartLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Lazy><SmartHome /></Lazy>} />
        <Route path="/ess" element={<Lazy><Pages.ESSHomePage /></Lazy>} />
        <Route path="/ess/approvals" element={<Lazy><Pages.ESSApprovalsPage /></Lazy>} />
        <Route path="/my-todo" element={<Lazy><Pages.MyTodoPage /></Lazy>} />
        <Route path="/my-groups" element={<Lazy><Pages.MyGroupsTodoPage /></Lazy>} />
        <Route path="/catalog" element={<Lazy><Pages.CatalogPage /></Lazy>} />
        <Route path="/catalog/:id" element={<Lazy><Pages.CatalogItemPage /></Lazy>} />
        <Route path="/knowledge" element={<Lazy><Pages.KnowledgePage /></Lazy>} />
        <Route path="/cart" element={<Lazy><Pages.CartPage /></Lazy>} />
        <Route path="/requests" element={<Lazy><Pages.RequestsPage /></Lazy>} />
        <Route path="/request-tasks" element={<Lazy><Pages.RequestTasksPage /></Lazy>} />
        <Route path="/request-tasks/:taskId" element={<Lazy><Pages.RequestTaskDetailPage /></Lazy>} />
        <Route path="/requests/:id" element={<Lazy><Pages.RequestDetail /></Lazy>} />
        <Route path="/incidents" element={<Lazy><Pages.IncidentsPage /></Lazy>} />
        <Route path="/incidents/new" element={<Lazy><Pages.NewIncident /></Lazy>} />
        <Route path="/incidents/:id" element={<Lazy><Pages.IncidentDetail /></Lazy>} />
        <Route path="/major-incidents" element={<Lazy><Pages.MajorIncidentsPage /></Lazy>} />
        <Route path="/major-incidents/:id" element={<Lazy><Pages.MajorIncidentWarRoom /></Lazy>} />
        <Route path="/major-incidents/:id/postmortem" element={<Lazy><Pages.MajorIncidentPostmortemPage /></Lazy>} />
        <Route path="/problems" element={<Lazy><Pages.ProblemsPage /></Lazy>} />
        <Route path="/problems/new" element={<Lazy><Pages.ProblemDetail /></Lazy>} />
        <Route path="/problems/:id" element={<Lazy><Pages.ProblemDetail /></Lazy>} />
        <Route path="/changes" element={<Lazy><Pages.ChangesPage /></Lazy>} />
        <Route path="/changes/new" element={<Lazy><Pages.ChangeDetailPage /></Lazy>} />
        <Route path="/changes/:id" element={<Lazy><Pages.ChangeDetailPage /></Lazy>} />
        <Route path="/changes/calendar" element={<Lazy><Pages.ChangeCalendarPage /></Lazy>} />
        <Route path="/reports" element={<Lazy><Pages.ReportsLibraryPage /></Lazy>} />
        <Route path="/reports/new" element={<Lazy><Pages.ReportBuilderPage /></Lazy>} />
        <Route path="/reports/:reportId" element={<Lazy><Pages.ReportViewerPage /></Lazy>} />
        <Route path="/reports/:reportId/builder" element={<Lazy><Pages.ReportBuilderPage /></Lazy>} />
        <Route path="/cmdb" element={<Lazy><Pages.CMDBPage /></Lazy>} />
        <Route path="/cmdb/new" element={<Lazy><Pages.CIForm /></Lazy>} />
        <Route path="/cmdb/:id" element={<Lazy><Pages.CIDetail /></Lazy>} />
        <Route path="/cmdb/:id/edit" element={<Lazy><Pages.CIForm /></Lazy>} />
        <Route path="/admin" element={<AdminAccessGuard />}>
          <Route path="ci-classes" element={<Lazy><Pages.CIClassesPage /></Lazy>} />
          <Route path="users" element={<Lazy><Pages.UsersPage /></Lazy>} />
          <Route path="users/new" element={<Lazy><Pages.UserDetailPage /></Lazy>} />
          <Route path="users/:id" element={<Lazy><Pages.UserDetailPage /></Lazy>} />
          <Route path="departments" element={<Lazy><Pages.DepartmentsPage /></Lazy>} />
          <Route path="departments/new" element={<Lazy><Pages.DepartmentsDetailPage /></Lazy>} />
          <Route path="departments/:id" element={<Lazy><Pages.DepartmentsDetailPage /></Lazy>} />
          <Route path="cost-centers" element={<Lazy><Pages.CostCentersPage /></Lazy>} />
          <Route path="cost-centers/new" element={<Lazy><Pages.CostCentersDetailPage /></Lazy>} />
          <Route path="cost-centers/:id" element={<Lazy><Pages.CostCentersDetailPage /></Lazy>} />
          <Route path="companies" element={<Lazy><Pages.CompaniesPage /></Lazy>} />
          <Route path="companies/new" element={<Lazy><Pages.CompaniesDetailPage /></Lazy>} />
          <Route path="companies/:id" element={<Lazy><Pages.CompaniesDetailPage /></Lazy>} />
          <Route path="locations" element={<Lazy><Pages.LocationsPage /></Lazy>} />
          <Route path="locations/new" element={<Lazy><Pages.LocationsDetailPage /></Lazy>} />
          <Route path="locations/:id" element={<Lazy><Pages.LocationsDetailPage /></Lazy>} />
          <Route path="roles" element={<Lazy><Pages.RolesPage /></Lazy>} />
          <Route path="roles/new" element={<Lazy><Pages.RolesDetailPage /></Lazy>} />
          <Route path="roles/:id" element={<Lazy><Pages.RolesDetailPage /></Lazy>} />
          <Route path="processes" element={<Lazy><Pages.ProcessesPage /></Lazy>} />
          <Route path="assignment-groups" element={<Lazy><Pages.AssignmentGroupsPage /></Lazy>} />
          <Route path="assignment-groups/new" element={<Lazy><Pages.AssignmentGroupDetailPage /></Lazy>} />
          <Route path="assignment-groups/:id" element={<Lazy><Pages.AssignmentGroupDetailPage /></Lazy>} />
          <Route path="workflows" element={<Lazy><Pages.WorkflowsPage /></Lazy>} />
          <Route path="workflows/editor" element={<Lazy><Pages.WorkflowEditorPage /></Lazy>} />
          <Route path="workflows/designer" element={<Navigate to="/admin/workflows/editor" replace />} />
          <Route path="workflows/:workflowId/:runId" element={<Lazy><Pages.WorkflowDetailPage /></Lazy>} />
          <Route path="service-items" element={<Lazy><Pages.ServiceItemsPage /></Lazy>} />
          <Route path="catalog-tasks" element={<Lazy><Pages.CatalogTasksPage /></Lazy>} />
          <Route path="catalog-tasks/:serviceItemId/new" element={<Lazy><Pages.CatalogTaskDetailPage /></Lazy>} />
          <Route path="catalog-tasks/:serviceItemId/:taskId" element={<Lazy><Pages.CatalogTaskDetailPage /></Lazy>} />
          <Route path="services" element={<Lazy><Pages.ServicesPage /></Lazy>} />
          <Route path="sla-config" element={<Lazy><Pages.SlaConfigPage /></Lazy>} />
          <Route path="notification-config" element={<Lazy><Pages.NotificationConfigPage /></Lazy>} />
          <Route path="notification-deliveries" element={<Lazy><Pages.NotificationEmailDeliveriesPage /></Lazy>} />
          <Route path="change-management" element={<Lazy><Pages.ChangeAdminPage /></Lazy>} />
          <Route path="knowledge-workflows" element={<Lazy><Pages.KnowledgeWorkflowsPage /></Lazy>} />
          <Route path="system-status" element={<Lazy><Pages.SystemStatusPage /></Lazy>} />
          <Route path="theming" element={<Lazy><Pages.ThemingPage /></Lazy>} />
          <Route path="data-sources" element={<Lazy><Pages.DataSourcesPage /></Lazy>} />
          <Route path="credentials" element={<Lazy><Pages.CredentialsPage /></Lazy>} />
          <Route path="config-packages" element={<Lazy><Pages.ConfigPackagesPage /></Lazy>} />
          <Route path="import" element={<Lazy><Pages.ImportPage /></Lazy>} />
          <Route path="import/history" element={<Lazy><Pages.ImportHistoryPage /></Lazy>} />
        </Route>
        <Route path="/profile/settings" element={<Lazy><Pages.ProfileSettingsPage /></Lazy>} />
        <Route path="/search" element={<Lazy><Pages.SearchResultsPage /></Lazy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
