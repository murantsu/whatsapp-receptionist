import type { Metadata } from 'next';
import Link from 'next/link';

import {
  GoogleCalendarConnection,
  type GoogleCalendarConnectionView,
} from '@/components/settings/GoogleCalendarConnection';
import { requireSession, type AuthSession } from '@/lib/auth/session';
import { logger } from '@/lib/logging/logger';
import { createGoogleCalendarOAuthService } from '@/server/integrations/google-calendar-oauth';

export const metadata: Metadata = {
  title: 'Google Calendar · Settings · AI Receptionist',
};

export const dynamic = 'force-dynamic';

async function loadStatus(session: AuthSession): Promise<GoogleCalendarConnectionView | null> {
  try {
    return await createGoogleCalendarOAuthService().getStatus({
      session,
      returnTo: '/settings/calendar',
    });
  } catch (error) {
    logger.error(
      { err: error, tenantId: session.tenantId },
      'Failed to load Google Calendar status',
    );
    return null;
  }
}

export default async function GoogleCalendarSettingsPage() {
  const session = await requireSession();
  const status = await loadStatus(session);

  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">
            <Link href="/settings" className="btn-link">
              Settings
            </Link>{' '}
            / Integrations
          </span>
          <h1>Google Calendar</h1>
          <p className="muted">Connect the single appointment calendar used by this shop.</p>
        </div>
      </div>

      {status ? (
        <GoogleCalendarConnection status={status} />
      ) : (
        <section className="card stack stack-3">
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Calendar status unavailable</h2>
          <p className="muted">No settings were changed. Reload or contact pilot support.</p>
          <Link href="/settings/calendar" className="btn btn-secondary btn-sm">
            Retry
          </Link>
        </section>
      )}
    </>
  );
}
