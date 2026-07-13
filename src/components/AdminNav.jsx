'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  UsersThree,
  Warning,
  MegaphoneSimple,
  Megaphone,
  Ghost,
  ClipboardText,
  CaretLeft,
  CaretRight,
  SignOut,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { logoutAction } from '@/actions/auth'

function NavItem({ onClick, href, icon: Icon, label, sublabel, active, badge, collapsed }) {
  const cls = `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left w-full transition-colors ${
    active ? 'bg-stone-700 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white'
  }`
  const content = (
    <>
      <Icon size={18} weight={active ? 'fill' : 'regular'} className="shrink-0" />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{label}</p>
            {badge > 0 && (
              <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                {badge}
              </span>
            )}
          </div>
          {sublabel && (
            <p className="text-xs text-stone-500 mt-0.5 truncate">{sublabel}</p>
          )}
        </div>
      )}
    </>
  )
  if (onClick) return <button onClick={onClick} className={cls}>{content}</button>
  return <Link href={href} className={cls}>{content}</Link>
}

export default function AdminNav({
  onHome,
  onGroups,
  onOrphans,
  onBanner,
  onSearch,
  orphanCount = 0,
  activeView = 'overview',
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('adminNavCollapsed') === 'true')
    } catch {}
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('adminNavCollapsed', String(next)) } catch {}
  }

  function isActive(view) {
    if (view === 'audit') return pathname === '/audit'
    if (view === 'errors') return pathname === '/errors'
    if (view === 'broadcast') return pathname === '/broadcast'
    if (view === 'search') return pathname === '/dashboard' && activeView === 'search'
    return pathname === '/dashboard' && activeView === view
  }

  return (
    <nav
      style={{ width: collapsed ? '3.5rem' : '14rem', minWidth: collapsed ? '3.5rem' : '14rem' }}
      className="bg-stone-900 flex flex-col shrink-0 transition-[width] duration-200 overflow-hidden"
    >
      {/* Header with collapse toggle */}
      <div className="flex items-center px-3 py-4 border-b border-stone-800 shrink-0 gap-2" style={{ minHeight: '4rem' }}>
        {!collapsed && (
          <Link href="/dashboard" className="flex-1 min-w-0 block">
            <p className="text-sm font-bold tracking-tight text-white">Covey Space</p>
            <p className="text-xs text-stone-400">Admin Panel</p>
          </Link>
        )}
        <button
          onClick={toggle}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors ml-auto"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <CaretRight size={14} weight="bold" />
            : <CaretLeft size={14} weight="bold" />
          }
        </button>
      </div>

      {/* Nav items */}
      <div className="flex flex-col p-2 gap-0.5 flex-1 overflow-y-auto">
        <NavItem
          onClick={onHome}
          href="/dashboard"
          icon={House}
          label="Overview"
          sublabel="Metrics and activity"
          active={isActive('overview')}
          collapsed={collapsed}
        />
        <NavItem
          onClick={onSearch}
          href="/dashboard?view=search"
          icon={MagnifyingGlass}
          label="Search"
          sublabel="Find users globally"
          active={isActive('search')}
          collapsed={collapsed}
        />
        <NavItem
          onClick={onGroups}
          href="/dashboard?view=groups"
          icon={UsersThree}
          label="Groups"
          sublabel="Manage communities"
          active={isActive('groups')}
          collapsed={collapsed}
        />
        <NavItem
          href="/errors"
          icon={Warning}
          label="Error Monitor"
          sublabel="Runtime errors from app"
          active={isActive('errors')}
          collapsed={collapsed}
        />
        <NavItem
          onClick={onBanner}
          href="/dashboard?view=banner"
          icon={MegaphoneSimple}
          label="In-App Banner"
          sublabel="Message all users"
          active={isActive('banner')}
          collapsed={collapsed}
        />
        <NavItem
          href="/broadcast"
          icon={Megaphone}
          label="Broadcast to All"
          sublabel="Push to every group"
          active={isActive('broadcast')}
          collapsed={collapsed}
        />
        <NavItem
          onClick={onOrphans}
          href="/dashboard?view=orphans"
          icon={Ghost}
          label="Orphaned Users"
          active={isActive('orphans')}
          badge={orphanCount}
          collapsed={collapsed}
        />
        <NavItem
          href="/audit"
          icon={ClipboardText}
          label="Audit Log"
          sublabel="Recent admin actions"
          active={isActive('audit')}
          collapsed={collapsed}
        />
      </div>

      {/* Logout */}
      <div className="p-2 border-t border-stone-800 shrink-0">
        <button
          onClick={() => logoutAction()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-stone-800 hover:text-red-300 transition-colors w-full"
        >
          <SignOut size={18} className="shrink-0" />
          {!collapsed && <p className="font-medium">Log out</p>}
        </button>
      </div>
    </nav>
  )
}
