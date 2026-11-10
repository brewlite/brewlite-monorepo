// Creates a local demo identity only; does not promote/reset existing accounts.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production') throw new Error('Local development database required');
  const email = (process.argv[2] || 'staff.demo@brewlite.local').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new Error('Email already exists; no account was changed');
  const password = `BrewLite!${randomBytes(15).toString('base64url')}`;
  const user = await db.user.create({ data: { email, fullName: 'Nhan vien demo BrewLite', passwordHash: await bcrypt.hash(password, 12), role: 'STAFF', emailVerifiedAt: new Date() }, select: { email: true, role: true } });
  console.log(JSON.stringify({ ...user, password, scope: 'local demo only', note: 'Preverified development fixture; does not send email or modify another account' }));
}
main().catch((error) => { console.error(error.message?.includes('database') || error.message?.includes('Email') ? error.message : 'Could not create local staff identity'); process.exitCode = 1; }).finally(() => db.$disconnect());
