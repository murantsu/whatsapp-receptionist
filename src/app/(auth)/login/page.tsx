import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in · Ambrogio.ai',
  description: 'Sign in to your Ambrogio.ai account',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="stack stack-6">
      <div className="stack stack-2">
        <h1 style={{ fontSize: 'var(--text-3xl)' }}>Welcome back</h1>
        <p className="muted">
          Enter your email and we will send you a secure sign-in link. No password required.
        </p>
      </div>

      <LoginForm />

      <div
        className="stack stack-3"
        style={{
          paddingTop: 'var(--space-6)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Need a pilot account?{' '}
          <Link href="/contact" className="btn-link">
            Contact the pilot team
          </Link>
        </p>
        <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          By requesting a sign-in link, you agree to the{' '}
          <Link href="/legal/terms" className="btn-link">
            terms of service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="btn-link">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
