import type { Metadata } from 'next';
import Link from 'next/link';

import { requireSession } from '@/lib/auth/session';
import type { AuthSession } from '@/lib/auth/session';
import { createConversationInboxService } from '@/server/conversations/inbox';
import type { ConversationChannel, ConversationSummary } from '@/server/conversations/inbox';
import { createTenantSettingsService } from '@/server/settings/tenant-settings';
import type { TenantSettingsSnapshot } from '@/server/settings/tenant-settings';
import { createUsageLimitsService } from '@/server/usage/limits';
import type { UsageMetricSnapshot } from '@/server/usage/limits';

export const metadata: Metadata = {
  title: 'Dashboard · Ambrogio.ai',
};

const RECENT_CONVERSATIONS_LIMIT = 8;

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram DM',
  web_chat: 'Web chat',
  sms: 'SMS',
};

const STATUS_PRESENTATION = {
  active: { label: 'Active', badge: 'badge-success' },
  escalated: { label: 'Needs human reply', badge: 'badge-warm' },
  closed: { label: 'Closed', badge: 'badge-neutral' },
  spam: { label: 'Spam', badge: 'badge-danger' },
} as const;

export default async function DashboardPage() {
  const session = await requireSession();

  const [usage, inbox, settings] = await Promise.all([
    createUsageLimitsService().getDashboardSnapshot({ session }),
    createConversationInboxService().listConversations({
      session,
      filters: { limit: RECENT_CONVERSATIONS_LIMIT },
    }),
    loadTenantSettings(session),
  ]);

  const timezone = settings?.tenant.timezone ?? null;
  const displayName = settings ? settings.config.studioName || settings.tenant.name : null;
  const conversations = inbox.conversations;

  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">Dashboard</span>
          <h1>{displayName ?? 'Your auto repair shop'}</h1>
          <p className="muted">Managed pilot · {formatMetricMonth(usage.metricMonth)}</p>
        </div>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <Link href="/conversations" className="btn btn-secondary">
            View conversations
          </Link>
          <Link href="/calendar" className="btn btn-primary">
            View appointments
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <article className="kpi">
          <span className="kpi-label">Conversations this month</span>
          <span className="kpi-value">{formatNumber(usage.conversations.used)}</span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            of {formatNumber(usage.conversations.limit)} included
          </span>
        </article>

        <article className="kpi">
          <span className="kpi-label">Messages exchanged</span>
          <span className="kpi-value">{formatNumber(usage.messages.used)}</span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Inbound and outbound this month
          </span>
        </article>

        <article className="kpi">
          <span className="kpi-label">Automatic replies</span>
          <span className="kpi-value">{usage.autoReplyAllowed ? 'Active' : 'Paused'}</span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {describeAutoReply(usage.autoReplyAllowed, usage.blockReason)}
          </span>
        </article>
      </div>

      <div className="dashboard-content-grid">
        <section className="card stack stack-4">
          <div className="row-between">
            <h2 style={{ fontSize: 'var(--text-xl)' }}>Recent conversations</h2>
            {conversations.length > 0 ? (
              <Link href="/conversations" className="btn-link">
                View all →
              </Link>
            ) : null}
          </div>

          {conversations.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No conversations yet</p>
              <p className="empty-state-text">
                Conversations appear here after the shop&apos;s WhatsApp Business number is
                connected.
              </p>
              <Link href="/settings/whatsapp" className="btn btn-primary">
                Connect WhatsApp
              </Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }} className="stack stack-3">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow conversation={conversation} timezone={timezone} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="stack stack-4">
          <div className="card stack stack-3">
            <span className="eyebrow">Pilot usage</span>
            <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
              {formatNumber(usage.conversations.used)}
              <span className="muted" style={{ fontSize: 'var(--text-base)' }}>
                /{formatNumber(usage.conversations.limit)}
              </span>
            </p>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              Conversations this month on the managed pilot.
            </p>
            <UsageMeter label="Conversations this month" metric={usage.conversations} />
          </div>

          {usage.blockReason !== null ? (
            <div className="card stack stack-3">
              <span className="eyebrow">Pilot limit reached</span>
              <p style={{ fontSize: 'var(--text-sm)' }}>
                {usage.blockReason === 'conversations_exceeded'
                  ? 'The conversation allowance is exhausted. Automatic replies are paused until the monthly reset or a managed adjustment.'
                  : 'Voice processing is disabled for this pilot.'}
              </p>
              <p className="muted">Contact the pilot operator for assistance.</p>
            </div>
          ) : usage.softWarning ? (
            <div className="card stack stack-3">
              <span className="eyebrow">Approaching the pilot limit</span>
              <p style={{ fontSize: 'var(--text-sm)' }}>
                More than 80% of the monthly conversation allowance has been used. Contact the pilot
                operator if you expect higher volume.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function ConversationRow({
  conversation,
  timezone,
}: Readonly<{ conversation: ConversationSummary; timezone: string | null }>) {
  const presentation = STATUS_PRESENTATION[conversation.status];
  const timestamp = formatTimestampParts(conversation.lastMessageAt, timezone);

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className="activity-row"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <span className="mono muted activity-row-time">
        <span style={{ display: 'block' }}>{timestamp.date}</span>
        <span style={{ display: 'block' }}>{timestamp.time}</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <p className="activity-row-title">
          {conversation.customerName ?? conversation.customerIdentifier}
        </p>
        <p className="muted activity-row-detail">
          {CHANNEL_LABELS[conversation.channel]} ·{' '}
          {conversation.aiEnabled ? 'AI receptionist active' : 'Human handling active'}
        </p>
      </div>
      <span className={`badge ${presentation.badge}`}>{presentation.label}</span>
    </Link>
  );
}

function UsageMeter({ label, metric }: Readonly<{ label: string; metric: UsageMetricSnapshot }>) {
  const fill = metric.exceeded
    ? 'var(--color-danger)'
    : metric.warning
      ? 'var(--color-warning)'
      : 'var(--color-accent)';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={metric.percent}
      aria-valuetext={`${metric.percent}% of limit`}
      style={{
        height: 6,
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-surface-sunken)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${metric.percent}%`,
          height: '100%',
          background: fill,
        }}
      />
    </div>
  );
}

/**
 * Il nome dell'attività è un dato di contorno: se il tenant non ha ancora
 * completato l'onboarding, la dashboard deve comunque mostrare i numeri reali
 * invece di andare in errore.
 */
async function loadTenantSettings(session: AuthSession): Promise<TenantSettingsSnapshot | null> {
  try {
    return await createTenantSettingsService().getSnapshot({ session });
  } catch {
    return null;
  }
}

function describeAutoReply(
  allowed: boolean,
  blockReason: 'conversations_exceeded' | 'voice_exceeded' | null,
): string {
  if (allowed) {
    return 'AI replies are available within the pilot allowance';
  }

  return blockReason === 'voice_exceeded'
    ? 'Voice processing is disabled for this pilot'
    : 'Conversation allowance exhausted until the monthly reset';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMetricMonth(metricMonth: string): string {
  const date = new Date(`${metricMonth}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return 'unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTimestampParts(
  isoDate: string,
  timezone: string | null,
): { date: string; time: string } {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return { date: '—', time: '—' };
  }

  const zone = timezone !== null ? { timeZone: timezone } : {};

  return {
    date: new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      ...zone,
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      ...zone,
    }).format(date),
  };
}
