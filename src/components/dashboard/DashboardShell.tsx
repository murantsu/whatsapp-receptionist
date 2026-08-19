import Link from 'next/link';
import type { ReactNode } from 'react';

const SIDEBAR_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '◐' },
  { href: '/conversations', label: 'Conversations', icon: '✻' },
  { href: '/calendar', label: 'Appointments', icon: '◫' },
  { href: '/knowledge', label: 'Knowledge Base', icon: '☰' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export interface DashboardShellProps {
  children: ReactNode;
  currentPath?: string;
  tenantName?: string;
}

export function DashboardShell({
  children,
  currentPath,
  tenantName = 'Your auto repair shop',
}: Readonly<DashboardShellProps>) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <Link
          href="/dashboard"
          className="site-logo"
          style={{ fontSize: 'var(--text-base)', display: 'block' }}
        >
          Ambrogio<span style={{ color: 'var(--color-accent)' }}>.ai</span>
        </Link>

        <div
          className="surface-flat"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            marginTop: 'var(--space-5)',
          }}
        >
          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Active shop
          </p>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              marginTop: '2px',
            }}
          >
            {tenantName}
          </p>
        </div>

        <ul className="sidebar-nav">
          {SIDEBAR_ITEMS.map((item) => {
            const active = currentPath === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="sidebar-link"
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true" style={{ width: '1.25rem' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="dashboard-main" id="main">
        {children}
      </main>
    </div>
  );
}
