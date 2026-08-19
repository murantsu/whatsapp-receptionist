'use client';

import { FormFeedback } from '@/components/forms/FormFeedback';
import { useApiForm } from '@/components/forms/useApiForm';

export function LoginForm() {
  const { state, onSubmit } = useApiForm({
    endpoint: '/api/auth/magic-link',
    successMessage:
      'If the address belongs to an account, you will receive a sign-in link shortly. Check your spam folder too.',
  });

  return (
    <form onSubmit={onSubmit} className="stack stack-4" noValidate>
      <FormFeedback state={state} id="login-form-errors" />

      <div className="field">
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@yourshop.com"
          className="input"
          aria-describedby="login-email-helper"
          disabled={state.status === 'submitting'}
        />
        <p className="helper" id="login-email-helper">
          We will send a secure link that expires after 10 minutes.
        </p>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={state.status === 'submitting'}
      >
        {state.status === 'submitting' ? 'Sending…' : 'Send sign-in link'}
      </button>
    </form>
  );
}
