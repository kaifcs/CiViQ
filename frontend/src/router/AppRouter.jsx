// Central application routing.
// Organizes routes by role and applies client-side navigation guards.
// Backend RBAC and ownership validation enforce actual security.

import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { LoadingState } from '../components/AsyncState'
import { useAuth } from '../hooks/useAuth'
import AdminAnalytics from '../pages/admin/AdminAnalytics'
import AdminAudit from '../pages/admin/AdminAudit'
import AdminComplaintDetail from '../pages/admin/AdminComplaintDetail'
import AdminComplaints from '../pages/admin/AdminComplaints'
import AdminConflictDetail from '../pages/admin/AdminConflictDetail'
import AdminConflicts from '../pages/admin/AdminConflicts'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminDepartmentDetail from '../pages/admin/AdminDepartmentDetail'
import AdminDepartments from '../pages/admin/AdminDepartments'
// Map screens are the only consumers of Leaflet, so they load on demand and
// keep the GIS bundle off the critical path for every other route.
const AdminMap = lazy(() => import('../pages/admin/AdminMap'))
import AdminProjectDetail from '../pages/admin/AdminProjectDetail'
import AdminProjects from '../pages/admin/AdminProjects'
import AdminSettings from '../pages/admin/AdminSettings'
import AdminUserDetail from '../pages/admin/AdminUserDetail'
import AdminUsers from '../pages/admin/AdminUsers'
import Login from '../pages/auth/Login'
import CitizenHome from '../pages/citizen/CitizenHome'
import CitizenNotFound from '../pages/citizen/CitizenNotFound'
import CitizenProjectDetail from '../pages/citizen/CitizenProjectDetail'
import CitizenProjects from '../pages/citizen/CitizenProjects'
import OfficerClashRespond from '../pages/officer/OfficerClashRespond'
import OfficerComplaintDetail from '../pages/officer/OfficerComplaintDetail'
import OfficerComplaints from '../pages/officer/OfficerComplaints'
import OfficerConflictDetail from '../pages/officer/OfficerConflictDetail'
import OfficerConflicts from '../pages/officer/OfficerConflicts'
import OfficerDashboard from '../pages/officer/OfficerDashboard'
const OfficerMap = lazy(() => import('../pages/officer/OfficerMap'))
import OfficerProjectDetail from '../pages/officer/OfficerProjectDetail'
import OfficerProjectNew from '../pages/officer/OfficerProjectNew'
import OfficerProjects from '../pages/officer/OfficerProjects'
import OfficerSettings from '../pages/officer/OfficerSettings'
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard'
import SupervisorSettings from '../pages/supervisor/SupervisorSettings'
import SupervisorTaskDetail from '../pages/supervisor/SupervisorTaskDetail'
import SupervisorTasks from '../pages/supervisor/SupervisorTasks'
import NotificationCenter from '../pages/notifications/NotificationCenter'

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  conflicts: 'Conflicts',
  map: 'City Map',
  complaints: 'Complaints',
  analytics: 'Analytics',
  audit: 'Audit Log',
  users: 'User Management',
  departments: 'Department Management',
  settings: 'Settings',
  tasks: 'Tasks',
  notifications: 'Notifications',
}

// Route guard: renders nothing until the session has been restored, otherwise
// an unauthenticated first paint would bounce the user to /login on refresh.
function RoleRoute({ children, role }) {
  const { user, loading, getDashboardPath } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={getDashboardPath()} replace />

  return children
}

function AdminLayout({ children, activeItem }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <DashboardLayout
      role="admin"
      activeItem={activeItem}
      pageTitle={PAGE_TITLES[activeItem] || 'Dashboard'}
      userName={user?.name || ''}
      userInitials={user?.initials || '?'}
      userRole={user?.roleLabel || ''}
      notificationsPath="/admin/notifications"
      onNavigate={(item) => {
        if (item === 'dashboard') navigate('/admin/dashboard')
        if (item === 'projects') navigate('/admin/projects')
        if (item === 'conflicts') navigate('/admin/conflicts')
        if (item === 'map') navigate('/admin/map')
        if (item === 'complaints') navigate('/admin/complaints')
        if (item === 'analytics') navigate('/admin/analytics')
        if (item === 'audit') navigate('/admin/audit')
        if (item === 'users') navigate('/admin/users')
        if (item === 'departments') navigate('/admin/departments')
        if (item === 'settings') navigate('/admin/settings')
      }}
    >
      {children}
    </DashboardLayout>
  )
}

function OfficerLayout({ children, activeItem }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <DashboardLayout
      role="officer"
      activeItem={activeItem}
      pageTitle={PAGE_TITLES[activeItem] || 'Dashboard'}
      userName={user?.name || ''}
      userInitials={user?.initials || '?'}
      userRole={user?.roleLabel || ''}
      notificationsPath="/officer/notifications"
      onNavigate={(item) => {
        if (item === 'dashboard') navigate('/officer/dashboard')
        if (item === 'projects') navigate('/officer/projects')
        if (item === 'conflicts') navigate('/officer/conflicts')
        if (item === 'map') navigate('/officer/map')
        if (item === 'complaints') navigate('/officer/complaints')
        if (item === 'settings') navigate('/officer/settings')
      }}
    >
      {children}
    </DashboardLayout>
  )
}

function SupervisorLayout({ children, activeItem }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <DashboardLayout
      role="supervisor"
      activeItem={activeItem}
      pageTitle={PAGE_TITLES[activeItem] || 'Dashboard'}
      userName={user?.name || ''}
      userInitials={user?.initials || '?'}
      userRole={user?.roleLabel || ''}
      notificationsPath="/supervisor/notifications"
      onNavigate={(item) => {
        if (item === 'dashboard') navigate('/supervisor/dashboard')
        if (item === 'tasks') navigate('/supervisor/tasks')
        if (item === 'settings') navigate('/supervisor/settings')
      }}
    >
      {children}
    </DashboardLayout>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingState label="Loading..." />}>
      <Routes>
        <Route path="/" element={<CitizenHome />} />
        <Route path="/login" element={<Login />} />

        <Route path="/admin/dashboard" element={<RoleRoute role="admin"><AdminLayout activeItem="dashboard"><AdminDashboard /></AdminLayout></RoleRoute>} />
        <Route path="/admin/projects" element={<RoleRoute role="admin"><AdminLayout activeItem="projects"><AdminProjects /></AdminLayout></RoleRoute>} />
        <Route path="/admin/projects/:id" element={<RoleRoute role="admin"><AdminLayout activeItem="projects"><AdminProjectDetail /></AdminLayout></RoleRoute>} />
        <Route path="/admin/conflicts" element={<RoleRoute role="admin"><AdminLayout activeItem="conflicts"><AdminConflicts /></AdminLayout></RoleRoute>} />
        <Route path="/admin/conflicts/:id" element={<RoleRoute role="admin"><AdminLayout activeItem="conflicts"><AdminConflictDetail /></AdminLayout></RoleRoute>} />
        <Route path="/admin/map" element={<RoleRoute role="admin"><AdminLayout activeItem="map"><AdminMap /></AdminLayout></RoleRoute>} />
        <Route path="/admin/complaints" element={<RoleRoute role="admin"><AdminLayout activeItem="complaints"><AdminComplaints /></AdminLayout></RoleRoute>} />
        <Route path="/admin/complaints/:id" element={<RoleRoute role="admin"><AdminLayout activeItem="complaints"><AdminComplaintDetail /></AdminLayout></RoleRoute>} />
        <Route path="/admin/analytics" element={<RoleRoute role="admin"><AdminLayout activeItem="analytics"><AdminAnalytics /></AdminLayout></RoleRoute>} />
        <Route path="/admin/audit" element={<RoleRoute role="admin"><AdminLayout activeItem="audit"><AdminAudit /></AdminLayout></RoleRoute>} />
        <Route path="/admin/users" element={<RoleRoute role="admin"><AdminLayout activeItem="users"><AdminUsers /></AdminLayout></RoleRoute>} />
        <Route path="/admin/users/:id" element={<RoleRoute role="admin"><AdminLayout activeItem="users"><AdminUserDetail /></AdminLayout></RoleRoute>} />
        <Route path="/admin/departments" element={<RoleRoute role="admin"><AdminLayout activeItem="departments"><AdminDepartments /></AdminLayout></RoleRoute>} />
        <Route path="/admin/departments/:id" element={<RoleRoute role="admin"><AdminLayout activeItem="departments"><AdminDepartmentDetail /></AdminLayout></RoleRoute>} />
        <Route path="/admin/notifications" element={<RoleRoute role="admin"><AdminLayout activeItem="notifications"><NotificationCenter /></AdminLayout></RoleRoute>} />
        <Route path="/admin/settings" element={<RoleRoute role="admin"><AdminLayout activeItem="settings"><AdminSettings /></AdminLayout></RoleRoute>} />

        <Route path="/officer/dashboard" element={<RoleRoute role="officer"><OfficerLayout activeItem="dashboard"><OfficerDashboard /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/projects" element={<RoleRoute role="officer"><OfficerLayout activeItem="projects"><OfficerProjects /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/projects/new" element={<RoleRoute role="officer"><OfficerLayout activeItem="projects"><OfficerProjectNew /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/projects/:id" element={<RoleRoute role="officer"><OfficerLayout activeItem="projects"><OfficerProjectDetail /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/projects/:id/respond" element={<RoleRoute role="officer"><OfficerLayout activeItem="projects"><OfficerClashRespond /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/conflicts" element={<RoleRoute role="officer"><OfficerLayout activeItem="conflicts"><OfficerConflicts /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/conflicts/:id" element={<RoleRoute role="officer"><OfficerLayout activeItem="conflicts"><OfficerConflictDetail /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/map" element={<RoleRoute role="officer"><OfficerLayout activeItem="map"><OfficerMap /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/complaints" element={<RoleRoute role="officer"><OfficerLayout activeItem="complaints"><OfficerComplaints /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/complaints/:id" element={<RoleRoute role="officer"><OfficerLayout activeItem="complaints"><OfficerComplaintDetail /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/notifications" element={<RoleRoute role="officer"><OfficerLayout activeItem="notifications"><NotificationCenter /></OfficerLayout></RoleRoute>} />
        <Route path="/officer/settings" element={<RoleRoute role="officer"><OfficerLayout activeItem="settings"><OfficerSettings /></OfficerLayout></RoleRoute>} />

        <Route path="/supervisor/dashboard" element={<RoleRoute role="supervisor"><SupervisorLayout activeItem="dashboard"><SupervisorDashboard /></SupervisorLayout></RoleRoute>} />
        <Route path="/supervisor/tasks" element={<RoleRoute role="supervisor"><SupervisorLayout activeItem="tasks"><SupervisorTasks /></SupervisorLayout></RoleRoute>} />
        <Route path="/supervisor/tasks/:id" element={<RoleRoute role="supervisor"><SupervisorLayout activeItem="tasks"><SupervisorTaskDetail /></SupervisorLayout></RoleRoute>} />
        <Route path="/supervisor/notifications" element={<RoleRoute role="supervisor"><SupervisorLayout activeItem="notifications"><NotificationCenter /></SupervisorLayout></RoleRoute>} />
        <Route path="/supervisor/settings" element={<RoleRoute role="supervisor"><SupervisorLayout activeItem="settings"><SupervisorSettings /></SupervisorLayout></RoleRoute>} />

        <Route path="/home" element={<CitizenHome />} />
        <Route path="/projects" element={<CitizenProjects />} />
        <Route path="/projects/:id" element={<CitizenProjectDetail />} />
        <Route path="*" element={<CitizenNotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
