import type { Metadata } from 'next';
import Link from 'next/link';

import { buildHowToEnrichedSchema, JsonLd } from '@/components/marketing/JsonLd';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

export const metadata: Metadata = {
  title: 'Onboarding · Ambrogio.ai',
  robots: { index: false, follow: false },
};

const ONBOARDING_HOWTO_SCHEMA = buildHowToEnrichedSchema({
  name: 'Set up the managed auto repair pilot',
  description:
    'Four guided steps to configure an English WhatsApp receptionist for one auto repair shop and one Google Calendar.',
  url: '/onboarding',
  totalTime: 'PT24H',
  tool: ['Meta Business account', 'Google Calendar', 'WhatsApp Business number'],
  supply: ['Services and durations', 'Business hours', 'Verified FAQs'],
  steps: [
    {
      name: 'Shop profile',
      text: 'Enter the shop name and United States time zone.',
    },
    {
      name: 'Hours and services',
      text: 'Configure business hours and the services customers can request.',
    },
    {
      name: 'Connect channels',
      text: 'Connect the WhatsApp Business number and the single Google Calendar used for appointments.',
    },
    {
      name: 'Test the flow',
      text: 'Test FAQs, booking, rescheduling, cancellation, and human handoff before activation.',
    },
  ],
});

const STEPS = [
  { n: 1, label: 'Shop profile', current: true, done: false },
  { n: 2, label: 'Hours and services', current: false, done: false },
  { n: 3, label: 'Connect channels', current: false, done: false },
  { n: 4, label: 'Test the flow', current: false, done: false },
] as const;

const VERTICALS = [{ value: 'auto_repair_shop', label: 'Auto Repair Shop' }] as const;

const VALID_VERTICALS: readonly string[] = VERTICALS.map((v) => v.value);

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
] as const;

interface OnboardingSearchParams {
  business_name?: string;
  vertical?: string;
}

interface OnboardingPageProps {
  searchParams: Promise<OnboardingSearchParams>;
}

const CURRENT_STEP = 1;
const TOTAL_STEPS = STEPS.length;

export default async function OnboardingPage({ searchParams }: Readonly<OnboardingPageProps>) {
  const params = await searchParams;
  // Pre-popoliamo da register form per evitare redundant entry (WCAG 2.2 SC 3.3.7).
  const prefilledBusinessName =
    typeof params.business_name === 'string' ? params.business_name : '';
  const prefilledVertical =
    typeof params.vertical === 'string' && VALID_VERTICALS.includes(params.vertical)
      ? params.vertical
      : '';
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <JsonLd data={ONBOARDING_HOWTO_SCHEMA} />
      <header
        style={{
          padding: 'var(--space-4) clamp(1.25rem, 4vw, 2.5rem)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <div className="container row-between">
          <Link href="/" className="site-logo">
            Ambrogio<span style={{ color: 'var(--color-accent)' }}>.ai</span>
          </Link>
          <Link href="/help" className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Need help? Contact support →
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="container"
        style={{ paddingBlock: 'var(--space-12)', maxWidth: '720px' }}
      >
        {/* Progress indicator: ol con role="progressbar" per screen reader,
            aria-current="step" sull'<li> corrente, span sr-only "corrente". */}
        <ol
          aria-label={`Onboarding step ${CURRENT_STEP} of ${TOTAL_STEPS}`}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={CURRENT_STEP}
          style={{
            listStyle: 'none',
            padding: 0,
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-12)',
            position: 'relative',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              right: '14px',
              height: '2px',
              background: 'var(--color-border)',
              zIndex: 0,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              width: '0%',
              height: '2px',
              background: 'var(--color-accent)',
              zIndex: 1,
              transition: 'width var(--duration-slow) var(--ease-out)',
            }}
          />
          {STEPS.map((step) => (
            <li
              key={step.n}
              aria-current={step.current ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-2)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: step.current
                    ? 'var(--color-accent)'
                    : step.done
                      ? 'var(--color-success)'
                      : 'var(--color-surface)',
                  color:
                    step.current || step.done
                      ? 'var(--color-accent-fg)'
                      : 'var(--color-text-muted)',
                  border: '2px solid',
                  borderColor: step.current
                    ? 'var(--color-accent)'
                    : step.done
                      ? 'var(--color-success)'
                      : 'var(--color-border-strong)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                }}
              >
                {step.done ? '✓' : step.n}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: step.current ? 600 : 500,
                  color: step.current ? 'var(--color-text)' : 'var(--color-text-muted)',
                  textAlign: 'center',
                  maxWidth: '110px',
                }}
              >
                {step.label}
              </span>
              {step.current ? <span className="sr-only">Current step.</span> : null}
            </li>
          ))}
        </ol>

        <div className="card card-padded stack stack-6">
          <div className="stack stack-2">
            <span className="eyebrow">Step 1 of 4</span>
            <h1 style={{ fontSize: 'var(--text-3xl)' }}>Tell us about your shop</h1>
            <p className="muted">
              We use these basics to configure the managed United States pilot.
            </p>
          </div>

          <OnboardingForm
            verticals={VERTICALS}
            timezones={TIMEZONES}
            prefilledBusinessName={prefilledBusinessName}
            prefilledVertical={prefilledVertical}
          />
        </div>

        <p
          className="muted text-center"
          style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-sm)' }}
        >
          Review our{' '}
          <Link href="/legal/privacy" className="btn-link">
            privacy policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
