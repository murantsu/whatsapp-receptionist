import { spawnSync } from 'node:child_process';
import { delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_NODE_MAJOR = 22;
const currentNodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
const npmNodePath = process.env['npm_node_execpath'];

// On Windows an npm installation can be launched by Node 22 while npm.cmd still
// resolves `node` to a different system version for package scripts. Re-enter
// this gate with the exact Node executable that launched npm before validating.
if (
  currentNodeMajor !== REQUIRED_NODE_MAJOR &&
  npmNodePath !== undefined &&
  npmNodePath !== '' &&
  npmNodePath !== process.execPath
) {
  const result = spawnSync(npmNodePath, [fileURLToPath(import.meta.url)], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

if (currentNodeMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    `Release gate requires Node.js ${REQUIRED_NODE_MAJOR}.x; current version is ${process.version}.`,
  );
  process.exit(1);
}

const npmCliPath = process.env['npm_execpath'];

if (npmCliPath === undefined || npmCliPath === '') {
  console.error('Release gate must be started with `npm run release:gate`.');
  process.exit(1);
}

// Explicit placeholders keep local and CI verification offline. They override
// any developer-shell values and never grant access to a real external service.
const releaseEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env['PATH'] ?? ''}`,
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder',
  ANTHROPIC_API_KEY: 'placeholder',
  OPENAI_API_KEY: '',
  ELEVENLABS_API_KEY: 'placeholder',
  WHATSAPP_API_KEY: 'placeholder',
  WHATSAPP_VERIFY_TOKEN: 'placeholder',
  WHATSAPP_APP_SECRET: 'placeholder',
  WHATSAPP_ACCESS_TOKEN: 'placeholder',
  WHATSAPP_WEBHOOK_HEADER_SECRET: 'placeholder',
  RESEND_API_KEY: '',
  GOOGLE_OAUTH_CLIENT_ID: '',
  GOOGLE_OAUTH_CLIENT_SECRET: '',
  GOOGLE_OAUTH_STATE_SECRET: '',
  GOOGLE_CALENDAR_REDIRECT_URI: '',
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: '',
  STRIPE_SECRET_KEY: 'placeholder',
  STRIPE_WEBHOOK_SECRET: 'placeholder',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'placeholder',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  INTERNAL_JOB_SECRET: 'placeholder',
  E2E_USE_EXISTING_BUILD: '1',
};

const gates = [
  ['Production dependency audit', ['run', 'security:audit:production']],
  ['Full dependency audit', ['run', 'security:audit:all']],
  ['TypeScript, ESLint, unit/integration tests and RLS lint', ['run', 'verify']],
  ['Tenant isolation database tests', ['run', 'test:db']],
  ['Production build', ['run', 'build']],
  ['Playwright release smoke', ['run', 'test:e2e:smoke']],
];

for (const [label, args] of gates) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [npmCliPath, ...args], {
    env: releaseEnvironment,
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nRelease gate passed.');
