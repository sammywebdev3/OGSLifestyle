// TEST-ONLY: prints an HS256 API key (role anon or service_role) for the disposable test stack,
// signed with the per-run secret in $TEST_JWT_SECRET. Never used with a real project.
import crypto from 'node:crypto';

const secret = process.env.TEST_JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('TEST_JWT_SECRET (32+ chars) is required');
const role = process.argv[2];
if (role !== 'anon' && role !== 'service_role') throw new Error('role must be anon or service_role');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ role, iss: 'supabase', iat: now, exp: now + 3600 });
process.stdout.write(`${head}.${body}.${crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`);
