// Shell for all authenticated roles: owns sidebar collapse and dark-mode state.

import { useEffect, useState } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

const THEME_KEY = 'civiq_theme'

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
  const [darkMode,  setDarkMode]  = useState(() => localStorage.getItem(THEME_KEY) === 'dark')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

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

              {/* Stacking context above Leaflet's control corners (z-index
                  1000), the same ceiling CitizenNav uses. The map routes render
                  Leaflet inside the content region below, whose panes reach 700
                  and controls 800 — without this the notification and profile
                  dropdowns (z-50) and their click-away backdrops (z-40) would
                  paint underneath it. Raising the wrapper covers every overlay
                  in the subtree at once. */}
              <div className="relative z-[1100] flex-shrink-0 bg-[#FFFFFF] dark:bg-[#171717] rounded-t-[10px]">
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
                <h1 className="sr-only">{pageTitle}</h1>
                {children}
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
