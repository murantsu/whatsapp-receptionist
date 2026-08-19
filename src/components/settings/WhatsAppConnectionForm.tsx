'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { FormFeedback } from '@/components/forms/FormFeedback';
import { useApiForm, type ApiFormState } from '@/components/forms/useApiForm';

const ENDPOINT = '/api/settings/integrations/whatsapp';

/**
 * Proiezione client dello stato di connessione.
 *
 * È dichiarata qui e non importata da `@/server/whatsapp/provisioning` perché
 * quel modulo istanzia il client Supabase con la service role key: anche un
 * import di solo tipo lo espone al grafo del bundle client. I campi sono gli
 * stessi di `WhatsAppConnectionStatus`, quindi il Server Component può passare
 * il risultato del servizio senza adattarlo.
 */
export interface WhatsAppConnectionView {
  readonly connected: boolean;
  readonly phoneNumberId: string | null;
  readonly displayPhoneNumber: string | null;
  readonly status: string | null;
  readonly hasApiKey: boolean;
  readonly connectedAt: string | null;
}

interface WhatsAppConnectionFormProps {
  readonly status: WhatsAppConnectionView;
  /** Only owners and admins can write; the API rejects other roles with 403. */
  readonly canManage: boolean;
}

const IDLE: ApiFormState = { status: 'idle', message: null };

export function WhatsAppConnectionForm({ status, canManage }: WhatsAppConnectionFormProps) {
  const router = useRouter();
  const isConnected = status.connected;

  const { state, onSubmit } = useApiForm({
    endpoint: ENDPOINT,
    locale: 'en-US',
    successMessage: isConnected ? 'WhatsApp number updated.' : 'WhatsApp number connected.',
    buildBody: (formData) => ({
      phoneNumberId: String(formData.get('phoneNumberId') ?? ''),
      displayPhoneNumber: String(formData.get('displayPhoneNumber') ?? ''),
      apiKey: String(formData.get('apiKey') ?? ''),
    }),
  });

  const [disconnectState, setDisconnectState] = useState<ApiFormState>(IDLE);
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);

  // Lo stato mostrato qui è letto lato server: dopo una scrittura riuscita va
  // riletto, altrimenti la scheda continua a descrivere la situazione di prima.
  const shouldRefresh = state.status === 'success' || disconnectState.status === 'success';
  useEffect(() => {
    if (shouldRefresh) {
      router.refresh();
    }
  }, [shouldRefresh, router]);

  const onDisconnect = useCallback(async (): Promise<void> => {
    setDisconnectState({ status: 'submitting', message: null });

    let response: Response;
    try {
      response = await fetch(ENDPOINT, { method: 'DELETE' });
    } catch {
      setDisconnectState({
        status: 'error',
        message: 'The request failed. Check your connection and try again.',
      });
      return;
    }

    if (!response.ok) {
      setDisconnectState({ status: 'error', message: await readErrorMessage(response) });
      return;
    }

    setIsConfirmingDisconnect(false);
    setDisconnectState({
      status: 'success',
      message: 'WhatsApp number disconnected. Incoming messages will no longer be handled.',
    });
  }, []);

  const isSubmitting = state.status === 'submitting';
  const isDisconnecting = disconnectState.status === 'submitting';

  return (
    <div className="stack stack-6">
      <section className="card stack stack-4">
        <div className="row-between" style={{ gap: 'var(--space-4)' }}>
          <div className="stack stack-2">
            <span className="eyebrow">Channel status</span>
            <h2 style={{ fontSize: 'var(--text-xl)' }}>
              {isConnected ? 'Number connected' : 'No number connected'}
            </h2>
          </div>
          <span className={isConnected ? 'badge badge-success' : 'badge badge-neutral'}>
            {statusLabel(status)}
          </span>
        </div>

        {isConnected ? (
          <dl className="stack stack-3" style={{ margin: 0 }}>
            <DetailRow
              label="Display number"
              value={status.displayPhoneNumber ?? 'Not set'}
              isMono={status.displayPhoneNumber !== null}
            />
            <DetailRow label="Phone number ID" value={status.phoneNumberId ?? '—'} isMono />
            <DetailRow
              label="API key"
              value={status.hasApiKey ? 'Saved and encrypted' : 'Missing: the channel cannot send'}
            />
            <DetailRow label="Connected on" value={formatDate(status.connectedAt)} />
          </dl>
        ) : (
          <div className="stack stack-3">
            <p className="muted">
              Until the number is connected, incoming WhatsApp messages cannot be assigned to this
              shop. Enter the channel details from the 360dialog Client Hub below.
            </p>
            {status.status !== null && status.status !== 'active' ? (
              <p className="helper">
                A previous configuration exists with status “{status.status}”. Saving new details
                will reactivate it.
              </p>
            ) : null}
          </div>
        )}

        <FormFeedback state={disconnectState} id="whatsapp-disconnect-feedback" />

        {isConnected && canManage ? (
          <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {isConfirmingDisconnect ? (
              <>
                <span className="helper" style={{ alignSelf: 'center' }}>
                  Confirm? The receptionist will stop replying on this number.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsConfirmingDisconnect(false)}
                  disabled={isDisconnecting}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsConfirmingDisconnect(true)}
              >
                Disconnect number
              </button>
            )}
          </div>
        ) : null}
      </section>

      {canManage ? (
        <form onSubmit={onSubmit} className="card stack stack-6" noValidate>
          <div className="stack stack-2">
            <h2 style={{ fontSize: 'var(--text-xl)' }}>
              {isConnected ? 'Update connection' : 'Connect number'}
            </h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              These details come from the 360dialog Client Hub that hosts the WhatsApp Business
              number.
            </p>
          </div>

          <FormFeedback state={state} id="whatsapp-connect-feedback" />

          <div className="field">
            <label htmlFor="phoneNumberId" className="label">
              Phone number ID
            </label>
            <input
              id="phoneNumberId"
              name="phoneNumberId"
              type="text"
              required
              maxLength={120}
              autoComplete="off"
              className="input"
              defaultValue={status.phoneNumberId ?? ''}
              placeholder="e.g. 109876543210987"
              aria-describedby="phoneNumberId-help"
              disabled={isSubmitting}
            />
            <p id="phoneNumberId-help" className="helper">
              In hub.360dialog.com, open the WhatsApp channel. The Phone number ID is shown in the
              number details and identifies which shop receives each incoming message.
            </p>
          </div>

          <div className="field">
            <label htmlFor="displayPhoneNumber" className="label">
              Display phone number
            </label>
            <input
              id="displayPhoneNumber"
              name="displayPhoneNumber"
              type="tel"
              maxLength={40}
              autoComplete="off"
              className="input"
              defaultValue={status.displayPhoneNumber ?? ''}
              placeholder="+1 555 123 4567"
              aria-describedby="displayPhoneNumber-help"
              disabled={isSubmitting}
            />
            <p id="displayPhoneNumber-help" className="helper">
              Optional. This is only used to recognize the number in the dashboard.
            </p>
          </div>

          <div className="field">
            <label htmlFor="apiKey" className="label">
              API key 360dialog
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              required
              minLength={8}
              maxLength={512}
              autoComplete="off"
              spellCheck={false}
              className="input"
              placeholder={isConnected ? 'Re-enter the key to save' : 'Paste the API key'}
              aria-describedby="apiKey-help"
              disabled={isSubmitting}
            />
            <p id="apiKey-help" className="helper">
              Find this in the channel&apos;s API key section in Client Hub. The key is encrypted at
              rest and is never shown again. Re-enter it whenever you update this connection.
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : isConnected ? 'Save changes' : 'Connect number'}
          </button>
        </form>
      ) : (
        <p className="helper">
          Only the account owner and administrators can change this integration.
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  isMono = false,
}: {
  label: string;
  value: string;
  isMono?: boolean;
}) {
  return (
    <div className="row-between" style={{ gap: 'var(--space-4)', alignItems: 'baseline' }}>
      <dt className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        {label}
      </dt>
      <dd
        className={isMono ? 'mono' : undefined}
        style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500, textAlign: 'right' }}
      >
        {value}
      </dd>
    </div>
  );
}

function statusLabel(status: WhatsAppConnectionView): string {
  if (status.connected) {
    return 'Active';
  }

  if (status.status === 'revoked') {
    return 'Disconnected';
  }

  return status.status === null ? 'Not configured' : status.status;
}

function formatDate(value: string | null): string {
  if (value === null) {
    return 'Unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable';
  }

  return parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** L'envelope d'errore di `jsonHandler` è `{ ok: false, error: { code, message } }`. */
async function readErrorMessage(response: Response): Promise<string> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const code = readErrorField(payload, 'code');

  if (code === 'forbidden') {
    return 'You do not have permission to change this integration.';
  }

  if (code === 'rate_limited') {
    return 'Too many attempts. Please try again in a few minutes.';
  }

  if (code === 'unauthorized') {
    return 'Your session is invalid. Please sign in again.';
  }

  const exposed = readErrorField(payload, 'message');
  if (exposed !== null && exposed !== 'Internal server error') {
    return exposed;
  }

  return 'We could not disconnect the number. Please try again shortly.';
}

function readErrorField(payload: unknown, field: 'code' | 'message'): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}
