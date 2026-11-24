import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const dataDir = path.resolve(rootDir, 'data');
const uploadsDir = path.resolve(rootDir, 'uploads');

fs.mkdirSync(dataDir, {recursive: true});
fs.mkdirSync(uploadsDir, {recursive: true});

function loadOrCreateSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  const keyFile = path.join(dataDir, 'secret.key');
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, generated, {mode: 0o600});
  return generated;
}

const parseNumber = (val: string | undefined, fallback: number): number => {
  if (val === undefined || val.trim() === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const parseBool = (val: string | undefined, fallback: boolean): boolean => {
  if (val === undefined || val.trim() === '') return fallback;
  const v = val.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  return fallback;
};

export const config = {
  rootDir,
  dataDir,
  uploadsDir,
  dbPath: path.join(dataDir, 'caterconnect.db'),
  jwtSecret: loadOrCreateSecret(),
  port: parseNumber(process.env.PORT, 3000),
  autoVerifyMinutes: parseNumber(process.env.AUTO_VERIFY_MINUTES, 2),
  maxGroupSize: parseNumber(process.env.MAX_GROUP_SIZE, 20),
  geofenceRadiusMeters: parseNumber(process.env.GEOFENCE_RADIUS_METERS, 200),
  seedDemoJobs: parseBool(process.env.SEED_DEMO_JOBS, true),
  autoConfirmBookings: parseBool(process.env.AUTO_CONFIRM_BOOKINGS, false),
  brandColor: process.env.BRAND_COLOR?.trim() || '#4B6F1B',
  defaultAdminPhone: '9000000000',
  demoPhoneStart: 9000000001,
  demoPhoneEnd: 9000000012,
};

export function isDemoPhone(phone: string): boolean {
  const num = Number(phone);
  return Number.isInteger(num) && num >= config.demoPhoneStart && num <= config.demoPhoneEnd;
}
