// Central application routing.
// Organizes routes by role and applies client-side navigation guards.
// Backend RBAC and ownership validation enforce actual security.

import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { LoadingState } from '../components/AsyncState'
import { useAuth } from '../hooks/useAuth'

// Frequently visited pages (eager)
import Login from '../pages/auth/Login'
import CitizenHome from '../pages/citizen/CitizenHome'
import AdminDashboard from '../pages/admin/AdminDashboard'
import OfficerDashboard from '../pages/officer/OfficerDashboard'
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard'

// Admin
const AdminAnalytics = lazy(() => import('../pages/admin/AdminAnalytics'))
const AdminAudit = lazy(() => import('../pages/admin/AdminAudit'))
const AdminComplaints = lazy(() => import('../pages/admin/AdminComplaints'))
const AdminComplaintDetail = lazy(() => import('../pages/admin/AdminComplaintDetail'))
const AdminConflicts = lazy(() => import('../pages/admin/AdminConflicts'))
const AdminConflictDetail = lazy(() => import('../pages/admin/AdminConflictDetail'))
const AdminDepartments = lazy(() => import('../pages/admin/AdminDepartments'))
const AdminDepartmentDetail = lazy(() => import('../pages/admin/AdminDepartmentDetail'))
const AdminProjects = lazy(() => import('../pages/admin/AdminProjects'))
const AdminProjectDetail = lazy(() => import('../pages/admin/AdminProjectDetail'))
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('../pages/admin/AdminUserDetail'))
const AdminSettings = lazy(() => import('../pages/admin/AdminSettings'))
const AdminMap = lazy(() => import('../pages/admin/AdminMap'))

// Citizen
const CitizenProjects = lazy(() => import('../pages/citizen/CitizenProjects'))
const CitizenProjectDetail = lazy(() => import('../pages/citizen/CitizenProjectDetail'))
const CitizenNotFound = lazy(() => import('../pages/citizen/CitizenNotFound'))

// Officer
const OfficerProjects = lazy(() => import('../pages/officer/OfficerProjects'))
const OfficerProjectDetail = lazy(() => import('../pages/officer/OfficerProjectDetail'))
const OfficerProjectNew = lazy(() => import('../pages/officer/OfficerProjectNew'))
const OfficerConflicts = lazy(() => import('../pages/officer/OfficerConflicts'))
const OfficerConflictDetail = lazy(() => import('../pages/officer/OfficerConflictDetail'))
const OfficerComplaints = lazy(() => import('../pages/officer/OfficerComplaints'))
const OfficerComplaintDetail = lazy(() => import('../pages/officer/OfficerComplaintDetail'))
const OfficerClashRespond = lazy(() => import('../pages/officer/OfficerClashRespond'))
const OfficerSettings = lazy(() => import('../pages/officer/OfficerSettings'))
const OfficerMap = lazy(() => import('../pages/officer/OfficerMap'))

// Supervisor
const SupervisorTasks = lazy(() => import('../pages/supervisor/SupervisorTasks'))
const SupervisorTaskDetail = lazy(() => import('../pages/supervisor/SupervisorTaskDetail'))
const SupervisorSettings = lazy(() => import('../pages/supervisor/SupervisorSettings'))

// Shared
const NotificationCenter = lazy(() => import('../pages/notifications/NotificationCenter'))

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
        {/* Same wizard, in edit mode — see OfficerProjectNew. */}
        <Route path="/officer/projects/:id/edit" element={<RoleRoute role="officer"><OfficerLayout activeItem="projects"><OfficerProjectNew /></OfficerLayout></RoleRoute>} />
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
