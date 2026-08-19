import type { Metadata } from 'next';
import Link from 'next/link';

import { ServicesManager } from '@/components/settings/ServicesManager';
import { type ServiceView } from '@/components/settings/services-model';
import { requireSession, type AuthSession } from '@/lib/auth/session';
import { logger } from '@/lib/logging/logger';
import { createTenantSettingsService } from '@/server/settings/tenant-settings';

export const metadata: Metadata = {
  title: 'Services · Settings · Ambrogio.ai',
};

// Il listino dipende dalla sessione: non deve finire in cache statica.
export const dynamic = 'force-dynamic';

type LoadResult =
  | { readonly ok: true; readonly services: readonly ServiceView[] }
  | { readonly ok: false };

async function loadServices(session: AuthSession): Promise<LoadResult> {
  try {
    const service = createTenantSettingsService();
    const services = await service.listServices({ session });

    return {
      ok: true,
      // Al client passiamo solo i campi che la schermata usa davvero.
      services: services.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        durationMinutes: item.durationMinutes,
        priceCents: item.priceCents,
        active: item.active,
      })),
    };
  } catch (error) {
    // Il layout ha già garantito la sessione: un errore qui viene dal datastore.
    logger.error({ err: error, tenantId: session.tenantId }, 'Lettura listino servizi fallita');
    return { ok: false };
  }
}

export default async function ServicesSettingsPage() {
  const session = await requireSession();
  const result = await loadServices(session);

  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">
            <Link href="/settings" className="btn-link">
              Settings
            </Link>{' '}
            / Shop
          </span>
          <h1>Services</h1>
          <p className="muted">
            Configure only services this shop provides, with duration and verified pricing when
            appropriate.
          </p>
        </div>
      </div>

      {result.ok ? (
        <ServicesManager
          services={result.services}
          canManage={session.role === 'owner' || session.role === 'admin'}
        />
      ) : (
        <section className="card stack stack-3">
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Services could not be loaded</h2>
          <p className="muted">
            Saved services were not changed. Reload the page and contact pilot support if the
            problem continues.
          </p>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <Link href="/settings/services" className="btn btn-secondary btn-sm">
              Retry
            </Link>
            <Link href="/contact" className="btn btn-ghost btn-sm">
              Contact support
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
