'use client';

import { useCallback, useState, type FormEvent } from 'react';

import { FormFeedback } from '@/components/forms/FormFeedback';
import type { ApiFormState } from '@/components/forms/useApiForm';

export function HandoffEmailForm({
  email,
  canManage,
}: {
  readonly email: string | null;
  readonly canManage: boolean;
}) {
  const [state, setState] = useState<ApiFormState>({ status: 'idle', message: null });

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get('email') ?? '').trim();
    setState({ status: 'submitting', message: null });

    try {
      const response = await fetch('/api/settings/tenant', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ humanEscalationEmail: value || null }),
      });
      if (!response.ok) {
        setState({ status: 'error', message: 'The handoff email could not be saved.' });
        return;
      }
      setState({ status: 'success', message: 'Handoff email saved.' });
    } catch {
      setState({
        status: 'error',
        message: 'The request failed. Check your connection and try again.',
      });
    }
  }, []);

  return (
    <form onSubmit={submit} className="card stack stack-4" noValidate>
      <div className="stack stack-2">
        <h2 style={{ fontSize: 'var(--text-xl)' }}>Operator notification</h2>
        <p className="muted">
          Safety concerns, unknown answers, human requests, and Calendar failures are sent to this
          address for manual follow-up.
        </p>
      </div>

      <FormFeedback state={state} id="handoff-email-feedback" />

      <div className="field">
        <label htmlFor="handoff-email" className="label">
          Handoff email
        </label>
        <input
          id="handoff-email"
          name="email"
          className="input"
          type="email"
          autoComplete="email"
          defaultValue={email ?? ''}
          placeholder="service@example.com"
          disabled={!canManage || state.status === 'submitting'}
          aria-describedby="handoff-email-help"
        />
        <p id="handoff-email-help" className="helper">
          Leave this blank only while the pilot is disabled. A live pilot must have a monitored
          email.
        </p>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!canManage || state.status === 'submitting'}
      >
        {state.status === 'submitting' ? 'Saving…' : 'Save handoff email'}
      </button>
    </form>
  );
}
