// Shell for all authenticated roles: owns sidebar collapse and dark-mode state.

import { useState } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function DashboardLayout({
  children,
  role = 'admin',
  activeItem = 'dashboard',
  onNavigate,
  userName = '',
  userInitials = '?',
  userRole = '',
  notificationsPath,
  pageTitle,
  pageAction,
}) {
  const [darkMode,  setDarkMode]  = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-[#F7F7F7] dark:bg-[#0F0F0F]">

        <div className="flex-shrink-0 h-screen sticky top-0">
          <Sidebar
            role={role}
            activeItem={activeItem}
            onNavigate={onNavigate}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            darkMode={darkMode}
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto flex justify-center">
          <div
            className={['w-full h-full transition-all duration-200', collapsed ? 'px-10 py-4' : 'px-4 py-4'].join(' ')}
            style={{ maxWidth: '1280px' }}
          >
            <div className="h-[calc(100vh-32px)] bg-[#FFFFFF] dark:bg-[#171717] rounded-[10px] border border-[#E5E5E5] dark:border-[#1E293B] flex flex-col overflow-hidden">

              <div className="flex-shrink-0 bg-[#FFFFFF] dark:bg-[#171717] rounded-t-[10px]">
                <Navbar
                  pageTitle={pageTitle}
                  pageAction={pageAction}
                  notificationsPath={notificationsPath}
                  darkMode={darkMode}
                  onToggleDark={() => setDarkMode(!darkMode)}
                  userName={userName}
                  userInitials={userInitials}
                  userRole={userRole}
                />
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-8">
                {children}
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
