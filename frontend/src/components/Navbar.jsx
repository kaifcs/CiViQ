// Top bar of the dashboard shell: page title, theme toggle, notification bell
// and account menu. The unread badge reads the shared notification state rather
// than the dropdown's contents, so it matches the Notification Center exactly.

import { useState } from "react";
import Avatar from "./Avatar";
import { useAuth } from "../hooks/useAuth";
import { useNotificationCenter } from "../hooks/useNotificationCenter";
import { NotificationDropdown } from "./notifications";
import { useNavigate } from "react-router-dom";

const BellIcon = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const SunIcon = () => (
  <svg
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MoonIcon = () => (
  <svg
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const ChevronDown = () => (
  <svg
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function IconBtn({ children, onClick, badge = false, ...rest }) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="relative w-9 h-9 flex items-center justify-center rounded-[6px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F3F3F3] dark:hover:bg-[#1E293B] transition-all duration-150"
    >
      {children}
      {badge && (
        <span className="absolute top-1.5 right-1.5 w-[6px] h-[6px] bg-[#DC2626] rounded-full" />
      )}
    </button>
  );
}

export default function Navbar({
  pageTitle = "Dashboard",
  titleAsHeading = true,
  pageAction,
  notificationsPath,
  darkMode = false,
  onToggleDark,
  userName = "",
  userInitials = "?",
  userRole = "",
}) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useNotificationCenter();
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const Title = titleAsHeading ? "h1" : "p";

  return (
    <div className="flex items-center justify-between px-8 h-16 border-b border-[#E2E8F0] dark:border-[#1E293B] flex-shrink-0">
      <Title className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight leading-none">
        {pageTitle}
      </Title>

      <div className="flex items-center gap-3">
        {pageAction && <div>{pageAction}</div>}

        <IconBtn onClick={onToggleDark}>
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </IconBtn>

        <div className="relative">
          <IconBtn
            onClick={() => {
              setShowNotif(!showNotif);
              setShowProfile(false);
            }}
            badge={unreadCount > 0}
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            aria-expanded={showNotif}
          >
            <BellIcon />
          </IconBtn>
          {showNotif && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotif(false)}
              />
              <NotificationDropdown
                onClose={() => setShowNotif(false)}
                centerPath={notificationsPath}
              />
            </>
          )}
        </div>

        <div className="w-px h-5 bg-[#E2E8F0] dark:bg-[#1E293B]" />

        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotif(false);
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-all duration-150"
          >
            <Avatar initials={userInitials} size="sm" online />
            <span className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">
              {userName.split(" ")[0]}
            </span>
            <span className="text-[#94A3B8]">
              <ChevronDown />
            </span>
          </button>
          {showProfile && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProfile(false)}
              />
              <div className="absolute right-0 top-11 w-52 rounded-[8px] py-1 z-50 bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E2E8F0] dark:border-[#1E293B] shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.40)]">
                <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                  <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {userName}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {userRole}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (user?.role) navigate(`/${user.role}/settings`);
                    setShowProfile(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-[#475569] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#252529] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors"
                >
                  Profile & Settings
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#2D0A0A] transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
