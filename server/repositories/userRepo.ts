import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';

export interface UserRow {
  id: number;
  role: 'worker' | 'organisation' | 'admin';
  phone: string;
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
  notif_prefs: string;
  registered_at: string;
  verified_at: string | null;
  verified_by: string;
  rating_avg: number;
  rating_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrganisationRow {
  id: number;
  user_id: number;
  owner_name: string;
  phone: string;
  business_name: string;
  category: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  logo_url: string;
  contact_details: string;
  is_demo: number;
  registered_at: string;
  verified_at: string | null;
  verified_by: string;
  rating_avg: number;
  rating_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export function findUserByPhone(phone: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function findOrgByUserId(userId: number): OrganisationRow | undefined {
  return db.prepare('SELECT * FROM organisations WHERE user_id = ?').get(userId) as
    | OrganisationRow
    | undefined;
}

export function findOrgById(id: number): OrganisationRow | undefined {
  return db.prepare('SELECT * FROM organisations WHERE id = ?').get(id) as
    | OrganisationRow
    | undefined;
}

export function ensureDefaultAdmin(): void {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return;
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (
      role, phone, full_name, city, language, registered_at, verified_at, verified_by, status, created_at, updated_at
    ) VALUES ('admin', ?, 'CaterConnect Admin', 'Coimbatore', 'en', ?, ?, 'system', 'verified', ?, ?)`
  ).run(config.defaultAdminPhone, now, now, now, now);
}

export function autoVerifyIfDue(userId: number): void {
  if (config.autoVerifyMinutes <= 0) return;
  const user = findUserById(userId);
  if (!user || user.status !== 'pending') return;
  const elapsedMs = Date.now() - new Date(user.registered_at).getTime();
  if (elapsedMs >= config.autoVerifyMinutes * 60 * 1000) {
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE users SET status = 'verified', verified_at = ?, verified_by = 'auto', updated_at = ?
         WHERE id = ? AND status = 'pending'`
      ).run(now, now, userId);

      db.prepare(
        `UPDATE organisations SET status = 'verified', verified_at = ?, verified_by = 'auto', updated_at = ?
         WHERE user_id = ? AND status = 'pending'`
      ).run(now, now, userId);

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'verification', 'Account Verified!', 'Your account is now verified. You can access all features immediately.', '{}', 0, 'unread', ?, ?)`
      ).run(userId, now, now);
    });
    tx();
  }
}

export function runAutoVerifySweep(): number {
  if (config.autoVerifyMinutes <= 0) return 0;
  const cutoff = new Date(Date.now() - config.autoVerifyMinutes * 60 * 1000).toISOString();
  const pendingUsers = db
    .prepare(
      `SELECT id FROM users
       WHERE status = 'pending' AND role IN ('worker', 'organisation') AND registered_at <= ?`
    )
    .all(cutoff) as {id: number}[];

  let count = 0;
  for (const row of pendingUsers) {
    autoVerifyIfDue(row.id);
    count++;
  }
  return count;
}

export function updateWorkerProfile(
  userId: number,
  fields: {
    full_name?: string;
    address?: string;
    living_location?: string;
    lat?: number | null;
    lng?: number | null;
    city?: string;
    photo_url?: string;
    work_category?: string;
    skills?: string;
    experience?: string;
    preferred_areas?: string;
    availability?: string;
    language?: string;
    notif_prefs?: string;
  }
): UserRow | undefined {
  const existing = findUserById(userId);
  if (!existing) return undefined;
  const now = nowIso();
  db.prepare(
    `UPDATE users SET
      full_name = COALESCE(?, full_name),
      address = COALESCE(?, address),
      living_location = COALESCE(?, living_location),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      city = COALESCE(?, city),
      photo_url = COALESCE(?, photo_url),
      work_category = COALESCE(?, work_category),
      skills = COALESCE(?, skills),
      experience = COALESCE(?, experience),
      preferred_areas = COALESCE(?, preferred_areas),
      availability = COALESCE(?, availability),
      language = COALESCE(?, language),
      notif_prefs = COALESCE(?, notif_prefs),
      updated_at = ?
    WHERE id = ?`
  ).run(
    fields.full_name ?? null,
    fields.address ?? null,
    fields.living_location ?? null,
    fields.lat ?? null,
    fields.lng ?? null,
    fields.city ?? null,
    fields.photo_url ?? null,
    fields.work_category ?? null,
    fields.skills ?? null,
    fields.experience ?? null,
    fields.preferred_areas ?? null,
    fields.availability ?? null,
    fields.language ?? null,
    fields.notif_prefs ?? null,
    now,
    userId
  );
  return findUserById(userId);
}

export function updateOrgProfile(
  userId: number,
  fields: {
    owner_name?: string;
    business_name?: string;
    category?: string;
    address?: string;
    city?: string;
    lat?: number | null;
    lng?: number | null;
    logo_url?: string;
    contact_details?: string;
    language?: string;
    notif_prefs?: string;
  }
): {user: UserRow | undefined; organisation: OrganisationRow | undefined} {
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET
        full_name = COALESCE(?, full_name),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        language = COALESCE(?, language),
        notif_prefs = COALESCE(?, notif_prefs),
        updated_at = ?
      WHERE id = ?`
    ).run(
      fields.owner_name ?? null,
      fields.address ?? null,
      fields.city ?? null,
      fields.lat ?? null,
      fields.lng ?? null,
      fields.language ?? null,
      fields.notif_prefs ?? null,
      now,
      userId
    );

    db.prepare(
      `UPDATE organisations SET
        owner_name = COALESCE(?, owner_name),
        business_name = COALESCE(?, business_name),
        category = COALESCE(?, category),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        logo_url = COALESCE(?, logo_url),
        contact_details = COALESCE(?, contact_details),
        updated_at = ?
      WHERE user_id = ?`
    ).run(
      fields.owner_name ?? null,
      fields.business_name ?? null,
      fields.category ?? null,
      fields.address ?? null,
      fields.city ?? null,
      fields.lat ?? null,
      fields.lng ?? null,
      fields.logo_url ?? null,
      fields.contact_details ?? null,
      now,
      userId
    );
  });
  tx();
  return {user: findUserById(userId), organisation: findOrgByUserId(userId)};
}
