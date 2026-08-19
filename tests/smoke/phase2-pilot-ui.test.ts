import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function source(path: string): Promise<string> {
  return readFile(join(ROOT, path), 'utf8');
}

describe('Phase 2 managed pilot UI', () => {
  it('shows only the pilot navigation in the dashboard shell', async () => {
    const shell = await source('src/components/dashboard/DashboardShell.tsx');

    for (const route of ['/dashboard', '/conversations', '/calendar', '/knowledge', '/settings']) {
      expect(shell).toContain(`href: '${route}'`);
    }

    for (const hiddenRoute of ['/billing', '/agency', '/voice', '/team', '/locations']) {
      expect(shell).not.toContain(`href: '${hiddenRoute}'`);
    }
  });

  it('exposes required pilot settings and hides non-MVP settings', async () => {
    const settings = await source('src/app/(dashboard)/settings/page.tsx');

    for (const route of [
      '/settings/business-hours',
      '/settings/services',
      '/settings/whatsapp',
      '/settings/calendar',
      '/settings/handoff',
      '/knowledge',
    ]) {
      expect(settings).toContain(route);
    }

    for (const hiddenRoute of ['/billing', '/settings/voice', '/settings/team']) {
      expect(settings).not.toContain(hiddenRoute);
    }
  });

  it.each([
    ['src/app/(auth)/login/page.tsx', 'Welcome back'],
    ['src/app/(dashboard)/dashboard/page.tsx', 'Managed pilot'],
    ['src/app/(dashboard)/conversations/page.tsx', 'Conversations'],
    ['src/app/(dashboard)/conversations/[conversationId]/page.tsx', 'Human reply'],
    ['src/components/dashboard/OperatorReplyForm.tsx', 'Send message'],
    ['src/app/(dashboard)/calendar/page.tsx', 'Appointments'],
    ['src/app/(dashboard)/knowledge/page.tsx', 'Knowledge Base / FAQ'],
    ['src/app/(dashboard)/settings/services/page.tsx', 'Services'],
    ['src/app/(dashboard)/settings/business-hours/page.tsx', 'Business hours'],
    ['src/app/(dashboard)/settings/whatsapp/page.tsx', 'WhatsApp Business'],
    ['src/app/(dashboard)/settings/calendar/page.tsx', 'Google Calendar'],
    ['src/app/(dashboard)/settings/handoff/page.tsx', 'Human handoff'],
  ])('keeps %s available in English', async (path, marker) => {
    await expect(source(path)).resolves.toContain(marker);
  });
});
