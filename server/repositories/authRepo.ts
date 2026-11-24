import crypto from 'node:crypto';
import {config, isDemoPhone} from '../config.ts';
import {db, nowIso} from '../db.ts';
import {smsProvider} from '../services/smsProvider.ts';
import {findUserByPhone, type OrganisationRow, type UserRow} from './userRepo.ts';

export function normalizeIndianPhone(raw: string): string | null {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  while (digits.startsWith('0') && digits.length > 10) {
    digits = digits.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }
  return digits;
}

function hashOtp(phone: string, code: string): string {
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${phone}:${code}`)
    .digest('hex');
}

export async function createAndSendOtp(phone: string): Promise<{
  expiresAt: string;
  testCode?: string;
  provider: string;
}> {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashOtp(phone, code);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const tx = db.transaction(() => {
    // Cancel any older active OTPs for this phone
    db.prepare(
      `UPDATE otp_codes SET status = 'cancelled', updated_at = ?
       WHERE phone = ? AND status = 'active'`
    ).run(now, phone);

    db.prepare(
      `INSERT INTO otp_codes (phone, code_hash, attempts, expires_at, consumed, status, created_at, updated_at)
       VALUES (?, ?, 0, ?, 0, 'active', ?, ?)`
    ).run(phone, codeHash, expiresAt, now, now);
  });
  tx();

  const smsRes = await smsProvider.sendOtp(phone, code);
  return {
    expiresAt,
    testCode: smsRes.testCode,
    provider: smsRes.provider,
  };
}

export interface OtpVerifyResult {
  ok: boolean;
  error?: string;
  otpId?: number;
}

export function checkOtpInsideTx(phone: string, rawCode: string): OtpVerifyResult {
  const code = String(rawCode || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return {ok: false, error: 'Enter the 6-digit verification code.'};
  }

  const row = db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE phone = ? AND status = 'active' AND consumed = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(phone) as
    | {
        id: number;
        code_hash: string;
        attempts: number;
        expires_at: string;
        consumed: number;
      }
    | undefined;

  if (!row) {
    return {ok: false, error: 'No active code found. Please tap Send Code.'};
  }

  const now = nowIso();
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`UPDATE otp_codes SET status = 'expired', updated_at = ? WHERE id = ?`).run(
      now,
      row.id
    );
    return {ok: false, error: 'Code expired, request a new one'};
  }

  if (row.attempts >= 5) {
    db.prepare(`UPDATE otp_codes SET status = 'locked', updated_at = ? WHERE id = ?`).run(
      now,
      row.id
    );
    return {ok: false, error: 'Too many wrong attempts. Request a new code.'};
  }

  const candidateHash = hashOtp(phone, code);
  const matches = crypto.timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(row.code_hash, 'hex')
  );

  if (!matches) {
    const nextAttempts = row.attempts + 1;
    const remaining = Math.max(0, 5 - nextAttempts);
    db.prepare(
      `UPDATE otp_codes SET attempts = ?, status = ?, updated_at = ? WHERE id = ?`
    ).run(nextAttempts, remaining === 0 ? 'locked' : 'active', now, row.id);

    if (remaining === 0) {
      return {ok: false, error: 'Wrong code, 0 attempts left. Request a new code.'};
    }
    return {
      ok: false,
      error: `Wrong code, ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left`,
    };
  }

  return {ok: true, otpId: row.id};
}

export function consumeOtpById(otpId: number): void {
  const now = nowIso();
  db.prepare(
    `UPDATE otp_codes SET consumed = 1, status = 'consumed', updated_at = ? WHERE id = ?`
  ).run(now, otpId);
}

export function verifyOtpAndLogin(
  phone: string,
  code: string
): {ok: true; user: UserRow} | {ok: false; error: string; status: number} {
  if (isDemoPhone(phone)) {
    return {ok: false, error: 'Demo accounts cannot log in.', status: 403};
  }
  const user = findUserByPhone(phone);
  if (!user) {
    return {ok: false, error: 'No account found with this mobile number. Please register.', status: 404};
  }
  if (user.status === 'suspended') {
    return {ok: false, error: 'Your account has been suspended. Contact support.', status: 403};
  }
  if (user.status === 'rejected') {
    return {ok: false, error: 'Your registration was rejected. Contact support.', status: 403};
  }

  // Note: validate OTP outside rollback-heavy error if wrong attempt needs to persist!
  const check = checkOtpInsideTx(phone, code);
  if (!check.ok || !check.otpId) {
    return {ok: false, error: check.error || 'Invalid code', status: 400};
  }
  consumeOtpById(check.otpId);
  return {ok: true, user};
}

export interface RegisterWorkerInput {
  phone: string;
  code: string;
  full_name: string;
  address: string;
  living_location: string;
  lat: number | null;
  lng: number | null;
  city: string;
  photo_url: string;
  work_category: string;
  skills: string;
  experience: string;
  preferred_areas: string;
  availability: string;
  language: string;
}

export function registerWorkerWithOtp(
  input: RegisterWorkerInput
): {ok: true; user: UserRow} | {ok: false; error: string; status: number; code?: string} {
  if (isDemoPhone(input.phone)) {
    return {ok: false, error: 'This demo mobile number cannot be registered.', status: 400};
  }
  const existing = findUserByPhone(input.phone);
  if (existing) {
    return {
      ok: false,
      error: 'Already registered, please log in',
      status: 409,
      code: 'ALREADY_REGISTERED',
    };
  }

  // Validate required fields BEFORE checking/consuming OTP so failed form validation never consumes the OTP!
  if (!input.full_name.trim()) return {ok: false, error: 'Full name is required.', status: 400};
  if (!input.city.trim()) return {ok: false, error: 'City is required.', status: 400};
  if (!input.living_location.trim()) {
    return {ok: false, error: 'Living area or location pin is required.', status: 400};
  }
  if (!input.work_category.trim()) {
    return {ok: false, error: 'Please choose your work category.', status: 400};
  }

  // Check OTP first (outside rollback tx so wrong-code attempt increment persists!)
  const check = checkOtpInsideTx(input.phone, input.code);
  if (!check.ok || !check.otpId) {
    return {ok: false, error: check.error || 'Invalid code', status: 400};
  }

  const now = nowIso();
  const initialStatus = 'pending';
  const createTx = db.transaction(() => {
    consumeOtpById(check.otpId!);
    const info = db
      .prepare(
        `INSERT INTO users (
          role, phone, full_name, address, living_location, lat, lng, city, photo_url,
          work_category, skills, experience, preferred_areas, availability, language,
          registered_at, status, created_at, updated_at
        ) VALUES ('worker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.phone,
        input.full_name.trim(),
        input.address.trim(),
        input.living_location.trim(),
        input.lat,
        input.lng,
        input.city.trim(),
        input.photo_url,
        input.work_category.trim(),
        input.skills.trim(),
        input.experience.trim(),
        input.preferred_areas.trim(),
        input.availability.trim() || 'Available',
        input.language === 'ta' ? 'ta' : 'en',
        now,
        initialStatus,
        now,
        now
      );

    const userId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'welcome', 'Welcome to CaterConnect!', 'Your worker account is pending verification and will auto-verify shortly.', '{}', 0, 'unread', ?, ?)`
    ).run(userId, now, now);

    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  });

  const user = createTx();
  return {ok: true, user};
}

export interface RegisterOrgInput {
  phone: string;
  code: string;
  owner_name: string;
  business_name: string;
  category: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  logo_url: string;
  contact_details: string;
  language: string;
}

export function registerOrgWithOtp(
  input: RegisterOrgInput
):
  | {ok: true; user: UserRow; organisation: OrganisationRow}
  | {ok: false; error: string; status: number; code?: string} {
  if (isDemoPhone(input.phone)) {
    return {ok: false, error: 'This demo mobile number cannot be registered.', status: 400};
  }
  const existing = findUserByPhone(input.phone);
  if (existing) {
    return {
      ok: false,
      error: 'Already registered, please log in',
      status: 409,
      code: 'ALREADY_REGISTERED',
    };
  }

  if (!input.owner_name.trim()) return {ok: false, error: 'Owner name is required.', status: 400};
  if (!input.business_name.trim()) {
    return {ok: false, error: 'Business name is required.', status: 400};
  }
  if (!input.category.trim()) {
    return {ok: false, error: 'Organisation category is required.', status: 400};
  }
  if (!input.city.trim()) return {ok: false, error: 'City is required.', status: 400};
  if (!input.address.trim()) return {ok: false, error: 'Address is required.', status: 400};

  const check = checkOtpInsideTx(input.phone, input.code);
  if (!check.ok || !check.otpId) {
    return {ok: false, error: check.error || 'Invalid code', status: 400};
  }

  const now = nowIso();
  const createTx = db.transaction(() => {
    consumeOtpById(check.otpId!);
    const userInfo = db
      .prepare(
        `INSERT INTO users (
          role, phone, full_name, address, lat, lng, city, photo_url, language,
          registered_at, status, created_at, updated_at
        ) VALUES ('organisation', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(
        input.phone,
        input.owner_name.trim(),
        input.address.trim(),
        input.lat,
        input.lng,
        input.city.trim(),
        input.logo_url,
        input.language === 'ta' ? 'ta' : 'en',
        now,
        now,
        now
      );

    const userId = Number(userInfo.lastInsertRowid);
    const orgInfo = db
      .prepare(
        `INSERT INTO organisations (
          user_id, owner_name, phone, business_name, category, address, city, lat, lng,
          logo_url, contact_details, is_demo, registered_at, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?)`
      )
      .run(
        userId,
        input.owner_name.trim(),
        input.phone,
        input.business_name.trim(),
        input.category.trim(),
        input.address.trim(),
        input.city.trim(),
        input.lat,
        input.lng,
        input.logo_url,
        input.contact_details.trim() || input.phone,
        now,
        now,
        now
      );

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'welcome', 'Welcome to CaterConnect!', 'Your organisation account will be verified automatically shortly.', '{}', 0, 'unread', ?, ?)`
    ).run(userId, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
    const organisation = db
      .prepare('SELECT * FROM organisations WHERE id = ?')
      .get(Number(orgInfo.lastInsertRowid)) as OrganisationRow;

    return {user, organisation};
  });

  const created = createTx();
  return {ok: true, user: created.user, organisation: created.organisation};
}
