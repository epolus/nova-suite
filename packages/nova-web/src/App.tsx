/* SPDX-License-Identifier: AGPL-3.0-only */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import DarkModePreferenceSync from './components/DarkModePreferenceSync';
import LocalePreferenceSync from './components/LocalePreferenceSync';
import { LocaleProvider } from './context/LocaleContext';
import Layout from './components/Layout';
import ESSLayout from './components/ESSLayout';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CatalogPage from './pages/catalog/CatalogPage';
import CatalogItemPage from './pages/catalog/CatalogItemPage';
import CartPage from './pages/catalog/CartPage';
import RequestsPage from './pages/requests/RequestsPage';
import RequestTasksPage from './pages/requests/RequestTasksPage';
import RequestTaskDetailPage from './pages/requests/RequestTaskDetailPage';
import RequestDetail from './pages/requests/RequestDetail';
import IncidentsPage from './pages/incidents/IncidentsPage';
import IncidentDetail from './pages/incidents/IncidentDetail';
import NewIncident from './pages/incidents/NewIncident';
import CMDBPage from './pages/cmdb/CMDBPage';
import CIDetail from './pages/cmdb/CIDetail';
import CIForm from './pages/cmdb/CIForm';
import CIClassesPage from './pages/admin/CIClassesPage';
import UsersPage from './pages/admin/UsersPage';
import UserDetailPage from './pages/admin/UserDetailPage';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import DepartmentsDetailPage from './pages/admin/DepartmentsDetailPage';
import CostCentersPage from './pages/admin/CostCentersPage';
import CostCentersDetailPage from './pages/admin/CostCentersDetailPage';
import CompaniesPage from './pages/admin/CompaniesPage';
import CompaniesDetailPage from './pages/admin/CompaniesDetailPage';
import LocationsPage from './pages/admin/LocationsPage';
import LocationsDetailPage from './pages/admin/LocationsDetailPage';
import RolesPage from './pages/admin/RolesPage';
import RolesDetailPage from './pages/admin/RolesDetailPage';
import ProcessesPage from './pages/admin/ProcessesPage';
import AssignmentGroupsPage from './pages/admin/AssignmentGroupsPage';
import AssignmentGroupDetailPage from './pages/admin/AssignmentGroupDetailPage';
import WorkflowsPage from './pages/admin/WorkflowsPage';
import WorkflowDetailPage from './pages/admin/WorkflowDetailPage';
import WorkflowEditorPage from './pages/admin/WorkflowEditorPage';
import MyTodoPage from './pages/MyTodoPage';
import MyGroupsTodoPage from './pages/MyGroupsTodoPage';
import ImportPage from './pages/admin/ImportPage';
import ImportHistoryPage from './pages/admin/ImportHistoryPage';
import CatalogTasksPage from './pages/admin/CatalogTasksPage';
import CatalogTaskDetailPage from './pages/admin/CatalogTaskDetailPage';
import ServiceItemsPage from './pages/admin/ServiceItemsPage';
import ServicesPage from './pages/admin/ServicesPage';
import SlaConfigPage from './pages/admin/SlaConfigPage';
import ThemingPage from './pages/admin/ThemingPage';
import DataSourcesPage from './pages/admin/DataSourcesPage';
import CredentialsPage from './pages/admin/CredentialsPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import KnowledgePage from './pages/knowledge/KnowledgePage';
import KnowledgeWorkflowsPage from './pages/admin/KnowledgeWorkflowsPage';
import ESSHomePage from './pages/ess/ESSHomePage';
import ESSApprovalsPage from './pages/ess/ESSApprovalsPage';
import ProblemsPage from './pages/problems/ProblemsPage';
import ProblemDetail from './pages/problems/ProblemDetail';
import ChangesPage from './pages/changes/ChangesPage';
import ChangeDetailPage from './pages/changes/ChangeDetail';
import ChangeCalendarPage from './pages/changes/ChangeCalendarPage';
import ChangeAdminPage from './pages/admin/ChangeAdminPage';
import NotificationConfigPage from './pages/admin/NotificationConfigPage';
import SearchResultsPage from './pages/SearchResultsPage';
import SystemStatusPage from './pages/admin/SystemStatusPage';
import AdminAccessGuard from './components/AdminAccessGuard';
import { isAgentRole } from './utils/roles';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Picks the right layout based on the user's role. */
function SmartLayout() {
  const { user } = useAuth();
  return isAgentRole(user?.roles) ? <Layout /> : <ESSLayout />;
}

/** Home route: Dashboard for agents, ESS home for regular users. */
function SmartHome() {
  const { user } = useAuth();
  return isAgentRole(user?.roles) ? <Dashboard /> : <Navigate to="/ess" replace />;
}

function AppRoutes() {
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
        <Route path="/" element={<SmartHome />} />
        <Route path="/ess" element={<ESSHomePage />} />
        <Route path="/ess/approvals" element={<ESSApprovalsPage />} />
        <Route path="/my-todo" element={<MyTodoPage />} />
        <Route path="/my-groups" element={<MyGroupsTodoPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:id" element={<CatalogItemPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/request-tasks" element={<RequestTasksPage />} />
        <Route path="/request-tasks/:taskId" element={<RequestTaskDetailPage />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/new" element={<NewIncident />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/new" element={<ProblemDetail />} />
        <Route path="/problems/:id" element={<ProblemDetail />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/changes/new" element={<ChangeDetailPage />} />
        <Route path="/changes/:id" element={<ChangeDetailPage />} />
        <Route path="/changes/calendar" element={<ChangeCalendarPage />} />
        <Route path="/cmdb" element={<CMDBPage />} />
        <Route path="/cmdb/new" element={<CIForm />} />
        <Route path="/cmdb/:id" element={<CIDetail />} />
        <Route path="/cmdb/:id/edit" element={<CIForm />} />
        <Route path="/admin" element={<AdminAccessGuard />}>
          <Route path="ci-classes" element={<CIClassesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/new" element={<UserDetailPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="departments/new" element={<DepartmentsDetailPage />} />
          <Route path="departments/:id" element={<DepartmentsDetailPage />} />
          <Route path="cost-centers" element={<CostCentersPage />} />
          <Route path="cost-centers/new" element={<CostCentersDetailPage />} />
          <Route path="cost-centers/:id" element={<CostCentersDetailPage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/new" element={<CompaniesDetailPage />} />
          <Route path="companies/:id" element={<CompaniesDetailPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="locations/new" element={<LocationsDetailPage />} />
          <Route path="locations/:id" element={<LocationsDetailPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="roles/new" element={<RolesDetailPage />} />
          <Route path="roles/:id" element={<RolesDetailPage />} />
          <Route path="processes" element={<ProcessesPage />} />
          <Route path="assignment-groups" element={<AssignmentGroupsPage />} />
          <Route path="assignment-groups/new" element={<AssignmentGroupDetailPage />} />
          <Route path="assignment-groups/:id" element={<AssignmentGroupDetailPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="workflows/designer" element={<WorkflowEditorPage />} />
          <Route path="workflows/:workflowId/:runId" element={<WorkflowDetailPage />} />
          <Route path="service-items" element={<ServiceItemsPage />} />
          <Route path="catalog-tasks" element={<CatalogTasksPage />} />
          <Route path="catalog-tasks/:serviceItemId/new" element={<CatalogTaskDetailPage />} />
          <Route path="catalog-tasks/:serviceItemId/:taskId" element={<CatalogTaskDetailPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="sla-config" element={<SlaConfigPage />} />
          <Route path="notification-config" element={<NotificationConfigPage />} />
          <Route path="change-management" element={<ChangeAdminPage />} />
          <Route path="knowledge-workflows" element={<KnowledgeWorkflowsPage />} />
          <Route path="system-status" element={<SystemStatusPage />} />
          <Route path="theming" element={<ThemingPage />} />
          <Route path="data-sources" element={<DataSourcesPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="import/history" element={<ImportHistoryPage />} />
        </Route>
        <Route path="/profile/settings" element={<ProfileSettingsPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LocaleProvider>
          <AuthProvider>
            <LocalePreferenceSync />
            <DarkModePreferenceSync />
            <CartProvider>
              <AppRoutes />
            </CartProvider>
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
