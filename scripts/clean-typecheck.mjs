import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const buildInfoPath = resolve(process.cwd(), 'tsconfig.tsbuildinfo');

await rm(buildInfoPath, { force: true });
