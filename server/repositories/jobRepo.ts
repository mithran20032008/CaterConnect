import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export function todayIst(): string {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return nowIst.toISOString().slice(0, 10);
}

export interface JobQueryFilters {
  search?: string;
  city?: string;
  role?: string;
  serveType?: string;
  minPay?: number;
  maxDistanceKm?: number;
  date?: string;
  onlyOpen?: boolean;
  sort?: 'newest' | 'nearest';
  lat?: number | null;
  lng?: number | null;
}

export interface EnrichedJob {
  id: number;
  organisation_id: number;
  org_name: string;
  org_logo: string;
  org_verified: boolean;
  org_rating: number;
  org_rating_count: number;
  work_name: string;
  serve_type: string;
  event_date: string;
  reporting_time: string;
  service_start: string;
  service_end: string;
  location_name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  workers_required: number;
  booked_count: number;
  remaining_spots: number;
  dress_code: string;
  base_pay: number;
  bus_fare: number;
  total_pay: number;
  food_provided: number;
  transport_provided: number;
  special_instructions: string;
  show_contact: number;
  contact_phone: string;
  allow_partial_group: number;
  is_urgent: number;
  is_demo: number;
  status: string;
  created_at: string;
  distance_km: number | null;
  is_saved: boolean;
  my_application_status: string | null;
  my_application_can_withdraw: boolean;
  my_booking_status: string | null;
  time_conflict: boolean;
}

function hydrateJobs(rows: Record<string, unknown>[], viewerUserId?: number, userLat?: number | null, userLng?: number | null): EnrichedJob[] {
  const savedSet = new Set<number>();
  const appMap = new Map<number, {status: string; canWithdraw: boolean}>();
  const bookingMap = new Map<number, string>();
  const confirmedSchedule = new Set<string>();

  if (viewerUserId) {
    const savedRows = db
      .prepare('SELECT job_id FROM saved_jobs WHERE user_id = ?')
      .all(viewerUserId) as {job_id: number}[];
    for (const s of savedRows) savedSet.add(s.job_id);

    const appRows = db
      .prepare(
        `SELECT a.job_id, a.status, a.applicant_type, a.worker_id, g.leader_id
         FROM applications a
         LEFT JOIN groups g ON g.id = a.group_id
         LEFT JOIN group_members gm ON gm.group_id = a.group_id AND gm.worker_id = ? AND gm.status = 'accepted'
         WHERE (a.worker_id = ? OR gm.worker_id = ?) AND a.status NOT IN ('Rejected', 'Withdrawn')
         ORDER BY a.id ASC`
      )
      .all(viewerUserId, viewerUserId, viewerUserId) as {
        job_id: number;
        status: string;
        applicant_type: string;
        worker_id: number | null;
        leader_id: number | null;
      }[];
    for (const a of appRows) {
      const canWithdraw =
        a.status === 'Applied' &&
        ((a.applicant_type === 'individual' && a.worker_id === viewerUserId) ||
          (a.applicant_type === 'group' && a.leader_id === viewerUserId));
      appMap.set(a.job_id, {status: a.status, canWithdraw});
    }

    const bookRows = db
      .prepare(
        `SELECT b.job_id, b.status, j.event_date, j.serve_type
         FROM bookings b
         JOIN jobs j ON j.id = b.job_id
         WHERE b.worker_id = ? AND b.status IN ('Confirmed', 'Pending admin review', 'Accepted')`
      )
      .all(viewerUserId) as {job_id: number; status: string; event_date: string; serve_type: string}[];
    for (const b of bookRows) {
      bookingMap.set(b.job_id, b.status);
      if (b.status === 'Confirmed' || b.status === 'Pending admin review') {
        confirmedSchedule.add(`${b.event_date}|${b.serve_type}`);
      }
    }
  }

  return rows.map((r) => {
    const jobId = Number(r.id);
    const required = Number(r.workers_required);
    const booked = Number(r.booked_count || 0);
    const remaining = Math.max(0, required - booked);
    const jLat = typeof r.lat === 'number' ? r.lat : null;
    const jLng = typeof r.lng === 'number' ? r.lng : null;
    const distanceKm =
      typeof userLat === 'number' &&
      typeof userLng === 'number' &&
      jLat !== null &&
      jLng !== null
        ? haversineKm(userLat, userLng, jLat, jLng)
        : null;

    const myBooking = bookingMap.get(jobId) || null;
    const conflictKey = `${String(r.event_date)}|${String(r.serve_type)}`;
    const hasConflict = !myBooking && confirmedSchedule.has(conflictKey);

    return {
      id: jobId,
      organisation_id: Number(r.organisation_id),
      org_name: String(r.org_name),
      org_logo: String(r.org_logo || ''),
      org_verified: String(r.org_status) === 'verified',
      org_rating: Number(r.org_rating || 0),
      org_rating_count: Number(r.org_rating_count || 0),
      work_name: String(r.work_name),
      serve_type: String(r.serve_type),
      event_date: String(r.event_date),
      reporting_time: String(r.reporting_time),
      service_start: String(r.service_start || ''),
      service_end: String(r.service_end || ''),
      location_name: String(r.location_name),
      city: String(r.city),
      lat: jLat,
      lng: jLng,
      workers_required: required,
      booked_count: booked,
      remaining_spots: remaining,
      dress_code: String(r.dress_code || ''),
      base_pay: Number(r.base_pay || 0),
      bus_fare: Number(r.bus_fare || 0),
      total_pay: Number(r.total_pay || 0),
      food_provided: Number(r.food_provided || 0),
      transport_provided: Number(r.transport_provided || 0),
      special_instructions: String(r.special_instructions || ''),
      show_contact: Number(r.show_contact || 0),
      contact_phone: Number(r.show_contact) === 1 ? String(r.contact_phone || '') : '',
      allow_partial_group: Number(r.allow_partial_group || 0),
      is_urgent: Number(r.is_urgent || 0),
      is_demo: Number(r.is_demo || 0),
      status: String(r.status),
      created_at: String(r.created_at),
      distance_km: distanceKm,
      is_saved: savedSet.has(jobId),
      my_application_status: appMap.get(jobId)?.status || null,
      my_application_can_withdraw: Boolean(appMap.get(jobId)?.canWithdraw),
      my_booking_status: myBooking,
      time_conflict: hasConflict,
    };
  });
}

export function listOpenJobs(filters: JobQueryFilters, viewerUserId?: number): EnrichedJob[] {
  const today = todayIst();
  const clauses: string[] = ["j.status = 'open'", 'j.event_date >= ?'];
  const params: unknown[] = [today];

  if (!config.seedDemoJobs) {
    clauses.push('j.is_demo = 0');
  }

  if (filters.city && filters.city !== 'All') {
    clauses.push('LOWER(j.city) = LOWER(?)');
    params.push(filters.city.trim());
  }

  if (filters.serveType && filters.serveType !== 'All') {
    clauses.push('LOWER(j.serve_type) = LOWER(?)');
    params.push(filters.serveType.trim());
  }

  if (filters.date && filters.date.trim()) {
    clauses.push('j.event_date = ?');
    params.push(filters.date.trim());
  }

  if (typeof filters.minPay === 'number' && filters.minPay > 0) {
    clauses.push('j.total_pay >= ?');
    params.push(filters.minPay);
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      '(LOWER(j.work_name) LIKE ? OR LOWER(o.business_name) LIKE ? OR LOWER(j.location_name) LIKE ? OR LOWER(j.city) LIKE ?)'
    );
    params.push(q, q, q, q);
  }

  if (filters.role && filters.role !== 'All') {
    const roleQ = `%${filters.role.trim().toLowerCase()}%`;
    clauses.push('(LOWER(j.work_name) LIKE ? OR LOWER(j.special_instructions) LIKE ?)');
    params.push(roleQ, roleQ);
  }

  const sql = `
    SELECT
      j.*,
      o.business_name AS org_name,
      o.logo_url AS org_logo,
      o.status AS org_status,
      o.rating_avg AS org_rating,
      o.rating_count AS org_rating_count,
      (
        SELECT COUNT(*) FROM bookings b
        WHERE b.job_id = j.id AND b.status IN ('Confirmed', 'Completed')
      ) AS booked_count
    FROM jobs j
    JOIN organisations o ON o.id = j.organisation_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY j.created_at DESC, j.id DESC
  `;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  let jobs = hydrateJobs(rows, viewerUserId, filters.lat, filters.lng);

  if (filters.onlyOpen) {
    jobs = jobs.filter((j) => j.remaining_spots > 0);
  }

  if (typeof filters.maxDistanceKm === 'number' && filters.maxDistanceKm > 0) {
    jobs = jobs.filter(
      (j) => j.distance_km === null || j.distance_km <= filters.maxDistanceKm!
    );
  }

  if (filters.sort === 'nearest') {
    jobs.sort((a, b) => {
      if (a.distance_km === null && b.distance_km === null) return 0;
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });
  }

  return jobs;
}

export function getJobById(
  jobId: number,
  viewerUserId?: number,
  userLat?: number | null,
  userLng?: number | null
): EnrichedJob | null {
  const row = db
    .prepare(
      `SELECT
        j.*,
        o.business_name AS org_name,
        o.logo_url AS org_logo,
        o.status AS org_status,
        o.rating_avg AS org_rating,
        o.rating_count AS org_rating_count,
        (
          SELECT COUNT(*) FROM bookings b
          WHERE b.job_id = j.id AND b.status IN ('Confirmed', 'Completed')
        ) AS booked_count
      FROM jobs j
      JOIN organisations o ON o.id = j.organisation_id
      WHERE j.id = ?`
    )
    .get(jobId) as Record<string, unknown> | undefined;

  if (!row) return null;
  if (!config.seedDemoJobs && Number(row.is_demo) === 1) return null;
  return hydrateJobs([row], viewerUserId, userLat, userLng)[0];
}

export interface CreateJobInput {
  work_name: string;
  serve_type: string;
  event_date: string;
  reporting_time: string;
  service_start: string;
  service_end: string;
  location_name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  workers_required: number;
  dress_code: string;
  base_pay: number;
  bus_fare: number;
  food_provided: boolean;
  transport_provided: boolean;
  special_instructions: string;
  show_contact: boolean;
  contact_phone: string;
  allow_partial_group: boolean;
  is_urgent: boolean;
}

export function createJob(orgId: number, input: CreateJobInput): EnrichedJob {
  const now = nowIso();
  const basePay = Math.max(0, Math.round(input.base_pay));
  const busFare = Math.max(0, Math.round(input.bus_fare));
  const totalPay = basePay + busFare;

  const info = db
    .prepare(
      `INSERT INTO jobs (
        organisation_id, work_name, serve_type, event_date, reporting_time,
        service_start, service_end, location_name, city, lat, lng,
        workers_required, dress_code, base_pay, bus_fare, total_pay,
        food_provided, transport_provided, special_instructions,
        show_contact, contact_phone, allow_partial_group, is_urgent,
        is_demo, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)`
    )
    .run(
      orgId,
      input.work_name.trim(),
      input.serve_type.trim(),
      input.event_date.trim(),
      input.reporting_time.trim(),
      input.service_start.trim(),
      input.service_end.trim(),
      input.location_name.trim(),
      input.city.trim() || 'Coimbatore',
      input.lat,
      input.lng,
      Math.max(1, Math.round(input.workers_required)),
      input.dress_code.trim(),
      basePay,
      busFare,
      totalPay,
      input.food_provided ? 1 : 0,
      input.transport_provided ? 1 : 0,
      input.special_instructions.trim(),
      input.show_contact ? 1 : 0,
      input.show_contact ? input.contact_phone.trim() : '',
      input.allow_partial_group ? 1 : 0,
      input.is_urgent ? 1 : 0,
      now,
      now
    );

  return getJobById(Number(info.lastInsertRowid))!;
}

export function updateJob(
  jobId: number,
  orgId: number,
  input: Partial<CreateJobInput>
): {ok: true; job: EnrichedJob} | {ok: false; error: string; status: number} {
  const existing = db
    .prepare('SELECT * FROM jobs WHERE id = ? AND organisation_id = ?')
    .get(jobId, orgId) as Record<string, unknown> | undefined;
  if (!existing) {
    return {ok: false, error: 'Job not found.', status: 404};
  }

  const basePay =
    input.base_pay !== undefined ? Math.max(0, Math.round(input.base_pay)) : Number(existing.base_pay);
  const busFare =
    input.bus_fare !== undefined ? Math.max(0, Math.round(input.bus_fare)) : Number(existing.bus_fare);
  const totalPay = basePay + busFare;
  const now = nowIso();

  db.prepare(
    `UPDATE jobs SET
      work_name = COALESCE(?, work_name),
      serve_type = COALESCE(?, serve_type),
      event_date = COALESCE(?, event_date),
      reporting_time = COALESCE(?, reporting_time),
      service_start = COALESCE(?, service_start),
      service_end = COALESCE(?, service_end),
      location_name = COALESCE(?, location_name),
      city = COALESCE(?, city),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      workers_required = COALESCE(?, workers_required),
      dress_code = COALESCE(?, dress_code),
      base_pay = ?,
      bus_fare = ?,
      total_pay = ?,
      food_provided = COALESCE(?, food_provided),
      transport_provided = COALESCE(?, transport_provided),
      special_instructions = COALESCE(?, special_instructions),
      show_contact = COALESCE(?, show_contact),
      contact_phone = COALESCE(?, contact_phone),
      allow_partial_group = COALESCE(?, allow_partial_group),
      is_urgent = COALESCE(?, is_urgent),
      updated_at = ?
    WHERE id = ? AND organisation_id = ?`
  ).run(
    input.work_name?.trim() ?? null,
    input.serve_type?.trim() ?? null,
    input.event_date?.trim() ?? null,
    input.reporting_time?.trim() ?? null,
    input.service_start?.trim() ?? null,
    input.service_end?.trim() ?? null,
    input.location_name?.trim() ?? null,
    input.city?.trim() ?? null,
    input.lat ?? null,
    input.lng ?? null,
    input.workers_required !== undefined ? Math.max(1, Math.round(input.workers_required)) : null,
    input.dress_code?.trim() ?? null,
    basePay,
    busFare,
    totalPay,
    input.food_provided !== undefined ? (input.food_provided ? 1 : 0) : null,
    input.transport_provided !== undefined ? (input.transport_provided ? 1 : 0) : null,
    input.special_instructions?.trim() ?? null,
    input.show_contact !== undefined ? (input.show_contact ? 1 : 0) : null,
    input.contact_phone !== undefined ? input.contact_phone.trim() : null,
    input.allow_partial_group !== undefined ? (input.allow_partial_group ? 1 : 0) : null,
    input.is_urgent !== undefined ? (input.is_urgent ? 1 : 0) : null,
    now,
    jobId,
    orgId
  );

  return {ok: true, job: getJobById(jobId)!};
}

export function deleteJobBeforeBooking(
  jobId: number,
  orgId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const existing = db
    .prepare('SELECT id FROM jobs WHERE id = ? AND organisation_id = ?')
    .get(jobId, orgId);
  if (!existing) {
    return {ok: false, error: 'Job not found.', status: 404};
  }
  const booked = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM bookings WHERE job_id = ? AND status IN ('Confirmed', 'Pending admin review', 'Accepted', 'Completed')`
      )
      .get(jobId) as {cnt: number}
  ).cnt;
  if (booked > 0) {
    return {
      ok: false,
      error: 'Cannot delete a job that already has active bookings.',
      status: 409,
    };
  }
  db.prepare('DELETE FROM jobs WHERE id = ? AND organisation_id = ?').run(jobId, orgId);
  return {ok: true};
}

export function listOrgJobs(orgId: number): (EnrichedJob & {applicant_count: number})[] {
  const rows = db
    .prepare(
      `SELECT
        j.*,
        o.business_name AS org_name,
        o.logo_url AS org_logo,
        o.status AS org_status,
        o.rating_avg AS org_rating,
        o.rating_count AS org_rating_count,
        (
          SELECT COUNT(*) FROM bookings b
          WHERE b.job_id = j.id AND b.status IN ('Confirmed', 'Completed')
        ) AS booked_count
      FROM jobs j
      JOIN organisations o ON o.id = j.organisation_id
      WHERE j.organisation_id = ?
      ORDER BY j.created_at DESC, j.id DESC`
    )
    .all(orgId) as Record<string, unknown>[];

  const hydrated = hydrateJobs(rows);
  return hydrated.map((job) => {
    const appCount = (
      db.prepare('SELECT COUNT(*) AS cnt FROM applications WHERE job_id = ?').get(job.id) as {
        cnt: number;
      }
    ).cnt;
    return {...job, applicant_count: appCount};
  });
}

export function toggleSaveJob(userId: number, jobId: number): boolean {
  const existing = db
    .prepare('SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?')
    .get(userId, jobId) as {id: number} | undefined;
  if (existing) {
    db.prepare('DELETE FROM saved_jobs WHERE id = ?').run(existing.id);
    return false;
  }
  const now = nowIso();
  db.prepare(
    `INSERT INTO saved_jobs (user_id, job_id, status, created_at, updated_at)
     VALUES (?, ?, 'saved', ?, ?)`
  ).run(userId, jobId, now, now);
  return true;
}

export function listSavedJobs(userId: number): EnrichedJob[] {
  const rows = db
    .prepare(
      `SELECT
        j.*,
        o.business_name AS org_name,
        o.logo_url AS org_logo,
        o.status AS org_status,
        o.rating_avg AS org_rating,
        o.rating_count AS org_rating_count,
        (
          SELECT COUNT(*) FROM bookings b
          WHERE b.job_id = j.id AND b.status IN ('Confirmed', 'Completed')
        ) AS booked_count
      FROM saved_jobs s
      JOIN jobs j ON j.id = s.job_id
      JOIN organisations o ON o.id = j.organisation_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC`
    )
    .all(userId) as Record<string, unknown>[];
  return hydrateJobs(rows, userId);
}

export function listUserNotifications(userId: number) {
  const items = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`
    )
    .all(userId);
  const unreadCount = (
    db
      .prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as {cnt: number}
  ).cnt;
  return {items, unreadCount};
}

export function markNotificationsRead(userId: number, notificationId?: number): void {
  const now = nowIso();
  if (notificationId) {
    db.prepare(
      `UPDATE notifications SET is_read = 1, status = 'read', updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(now, notificationId, userId);
  } else {
    db.prepare(
      `UPDATE notifications SET is_read = 1, status = 'read', updated_at = ?
       WHERE user_id = ? AND is_read = 0`
    ).run(now, userId);
  }
}
