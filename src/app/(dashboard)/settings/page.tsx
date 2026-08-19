import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Settings · AI Receptionist',
};

interface SettingsLink {
  readonly href: string;
  readonly label: string;
}

interface SettingsGroup {
  readonly title: string;
  readonly description: string;
  readonly links: readonly SettingsLink[];
}

const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: 'Shop operations',
    description: 'Configure the appointment information customers can rely on.',
    links: [
      { href: '/settings/business-hours', label: 'Business hours' },
      { href: '/settings/services', label: 'Services' },
      { href: '/knowledge', label: 'Knowledge Base / FAQ' },
    ],
  },
  {
    title: 'Pilot integrations',
    description: 'Connect the single WhatsApp number and Google Calendar used by this shop.',
    links: [
      { href: '/settings/whatsapp', label: 'WhatsApp Business' },
      { href: '/settings/calendar', label: 'Google Calendar' },
      { href: '/settings/handoff', label: 'Handoff email' },
    ],
  },
];

const ROW_STYLE = {
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface-sunken)',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
} as const;

export default function SettingsPage() {
  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">Settings</span>
          <h1>Configure your auto repair shop</h1>
          <p className="muted">
            This managed pilot uses one location, one appointment calendar, and one operator handoff
            email. Billing and other non-pilot features are managed by the pilot team.
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.title} className="card stack stack-4">
            <div className="stack stack-2">
              <h2 style={{ fontSize: 'var(--text-xl)' }}>{group.title}</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {group.description}
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0 }} className="stack stack-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="row-between"
                    style={{
                      ...ROW_STYLE,
                      transition: 'background var(--duration-normal) var(--ease-out)',
                    }}
                  >
                    <span>{link.label}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
