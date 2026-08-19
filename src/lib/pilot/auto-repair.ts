export const AUTO_REPAIR_PILOT = {
  country: 'US',
  locale: 'en-US',
  businessType: 'auto_repair_shop',
  defaultTimezone: 'America/New_York',
  voiceInputEnabled: false,
  voiceReplyEnabled: false,
  selfServiceBillingEnabled: false,
} as const;

export function isEnUsLocale(locale: string | null | undefined): boolean {
  return locale?.toLowerCase() === AUTO_REPAIR_PILOT.locale.toLowerCase();
}
