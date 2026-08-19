import type { Metadata } from 'next';
import Link from 'next/link';

import { HandoffEmailForm } from '@/components/settings/HandoffEmailForm';
import { requireSession } from '@/lib/auth/session';
import { createTenantSettingsService } from '@/server/settings/tenant-settings';

export const metadata: Metadata = {
  title: 'Handoff email · Settings · AI Receptionist',
};

export const dynamic = 'force-dynamic';

export default async function HandoffSettingsPage() {
  const session = await requireSession();
  const snapshot = await createTenantSettingsService().getSnapshot({ session });

  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">
            <Link href="/settings" className="btn-link">
              Settings
            </Link>{' '}
            / Pilot operations
          </span>
          <h1>Human handoff</h1>
          <p className="muted">Choose the monitored inbox used when automation must stop.</p>
        </div>
      </div>

      <HandoffEmailForm
        email={snapshot.config.humanEscalationEmail}
        canManage={session.role === 'owner' || session.role === 'admin'}
      />
    </>
  );
}
