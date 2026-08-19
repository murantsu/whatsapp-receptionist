'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { FormFeedback } from '@/components/forms/FormFeedback';
import type { ApiFormState } from '@/components/forms/useApiForm';

export interface GoogleCalendarConnectionView {
  readonly connected: boolean;
  readonly status: 'not_connected' | 'active' | 'paused' | 'error' | 'revoked';
  readonly calendarId: string | null;
  readonly externalDisplayId: string | null;
  readonly connectedAt: string | null;
  readonly lastSyncAt: string | null;
  readonly canManage: boolean;
  readonly connectUrl: string;
  readonly disconnectUrl: string;
}

export function GoogleCalendarConnection({
  status,
}: {
  readonly status: GoogleCalendarConnectionView;
}) {
  const router = useRouter();
  const [state, setState] = useState<ApiFormState>({ status: 'idle', message: null });

  const disconnect = useCallback(async (): Promise<void> => {
    setState({ status: 'submitting', message: null });
    try {
      const response = await fetch(status.disconnectUrl, { method: 'POST' });
      if (!response.ok) {
        setState({
          status: 'error',
          message:
            'Google Calendar could not be disconnected. Please try again or contact support.',
        });
        return;
      }

      setState({ status: 'success', message: 'Google Calendar disconnected.' });
      router.refresh();
    } catch {
      setState({
        status: 'error',
        message: 'The request failed. Check your connection and try again.',
      });
    }
  }, [router, status.disconnectUrl]);

  return (
    <section className="card stack stack-4">
      <div className="row-between" style={{ gap: 'var(--space-4)' }}>
        <div className="stack stack-2">
          <span className="eyebrow">Connection status</span>
          <h2 style={{ fontSize: 'var(--text-xl)' }}>
            {status.connected ? 'Calendar connected' : 'Calendar not connected'}
          </h2>
        </div>
        <span className={status.connected ? 'badge badge-success' : 'badge badge-neutral'}>
          {statusLabel(status.status)}
        </span>
      </div>

      <p className="muted">
        This pilot uses one Google Calendar. An appointment is only confirmed after the Calendar
        write succeeds; failures are sent to human review.
      </p>

      {status.connected ? (
        <dl className="stack stack-3" style={{ margin: 0 }}>
          <Detail
            label="Calendar"
            value={status.externalDisplayId ?? status.calendarId ?? 'Primary'}
          />
          <Detail label="Connected" value={formatDate(status.connectedAt)} />
          <Detail label="Last successful sync" value={formatDate(status.lastSyncAt)} />
        </dl>
      ) : null}

      <FormFeedback state={state} id="google-calendar-feedback" />

      {status.canManage ? (
        <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {status.connected ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={disconnect}
              disabled={state.status === 'submitting'}
            >
              {state.status === 'submitting' ? 'Disconnecting…' : 'Disconnect calendar'}
            </button>
          ) : (
            <Link href={status.connectUrl} className="btn btn-primary">
              Connect Google Calendar
            </Link>
          )}
        </div>
      ) : (
        <p className="helper">
          Only the account owner or an administrator can manage this connection.
        </p>
      )}
    </section>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="row-between" style={{ gap: 'var(--space-4)' }}>
      <dt className="muted">{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

function statusLabel(status: GoogleCalendarConnectionView['status']): string {
  const labels: Record<GoogleCalendarConnectionView['status'], string> = {
    not_connected: 'Not connected',
    active: 'Active',
    paused: 'Paused',
    error: 'Needs attention',
    revoked: 'Disconnected',
  };
  return labels[status];
}

function formatDate(value: string | null): string {
  if (value === null) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
