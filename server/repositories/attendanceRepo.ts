import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';
import {haversineKm} from './jobRepo.ts';

function parseTime12or24(raw: string): {hours: number; minutes: number} | null {
  const m = String(raw || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return {hours: h, minutes: min};
}

export function eventStartUtcMs(eventDate: string, serviceStart: string, reportingTime: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const t = parseTime12or24(serviceStart) || parseTime12or24(reportingTime) || {hours: 9, minutes: 0};
  const hh = String(t.hours).padStart(2, '0');
  const mm = String(t.minutes).padStart(2, '0');
  // Parse explicitly as Asia/Kolkata (+05:30)
  const ms = Date.parse(`${eventDate}T${hh}:${mm}:00+05:30`);
  return Number.isFinite(ms) ? ms : null;
}

export function processOneHourAttendanceReminders(): number {
  const rows = db
    .prepare(
      `SELECT a.id AS attendance_id, a.booking_id, a.job_id, a.worker_id,
              j.work_name, j.event_date, j.reporting_time, j.service_start, j.location_name
       FROM attendance a
       JOIN bookings b ON b.id = a.booking_id
       JOIN jobs j ON j.id = a.job_id
       WHERE b.status = 'Confirmed'
         AND b.is_demo = 0
         AND a.reminder_sent_at IS NULL
         AND a.status = 'Pending'`
    )
    .all() as {
    attendance_id: number;
    booking_id: number;
    job_id: number;
    worker_id: number;
    work_name: string;
    event_date: string;
    reporting_time: string;
    service_start: string;
    location_name: string;
  }[];

  const nowMs = Date.now();
  const now = nowIso();
  let sentCount = 0;

  for (const r of rows) {
    const startMs = eventStartUtcMs(r.event_date, r.service_start, r.reporting_time);
    if (!startMs) continue;
    const diffMin = (startMs - nowMs) / 60000;
    // Trigger when starting within ~60 minutes (between -5 and +70 mins to handle restarts)
    if (diffMin <= 70 && diffMin >= -5) {
      sendReminderForAttendance(r.attendance_id, r.booking_id, r.job_id, r.worker_id, r.work_name, r.location_name, now);
      sentCount++;
    }
  }
  return sentCount;
}

function sendReminderForAttendance(
  attendanceId: number,
  bookingId: number,
  jobId: number,
  workerId: number,
  workName: string,
  locationName: string,
  now: string
) {
  db.transaction(() => {
    db.prepare(`UPDATE attendance SET reminder_sent_at = ?, updated_at = ? WHERE id = ?`).run(
      now,
      now,
      attendanceId
    );
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'attendance_reminder', '1-Hour Attendance Confirmation', ?, ?, 0, 'unread', ?, ?)`
    ).run(
      workerId,
      `Your catering event (${workName} at ${locationName}) starts in one hour. Please confirm your attendance.`,
      JSON.stringify({bookingId, jobId}),
      now,
      now
    );
  })();
}

export function triggerReminderNowForBooking(bookingId: number): {ok: true} | {ok: false; error: string; status: number} {
  const r = db
    .prepare(
      `SELECT a.id AS attendance_id, a.booking_id, a.job_id, a.worker_id, j.work_name, j.location_name
       FROM attendance a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.booking_id = ?`
    )
    .get(bookingId) as
    | {
        attendance_id: number;
        booking_id: number;
        job_id: number;
        worker_id: number;
        work_name: string;
        location_name: string;
      }
    | undefined;
  if (!r) return {ok: false, error: 'Confirmed booking attendance record not found.', status: 404};
  sendReminderForAttendance(r.attendance_id, r.booking_id, r.job_id, r.worker_id, r.work_name, r.location_name, nowIso());
  return {ok: true};
}

export function setJobToStartInOneHour(jobId: number): {ok: true; event_date: string; reporting_time: string} | {ok: false; error: string; status: number} {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
  if (!job) return {ok: false, error: 'Job not found.', status: 404};

  // Compute now + 60 min in Asia/Kolkata (+05:30)
  const targetIst = new Date(Date.now() + 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000);
  const eventDate = targetIst.toISOString().slice(0, 10);
  const hh24 = targetIst.getUTCHours();
  const min = String(targetIst.getUTCMinutes()).padStart(2, '0');
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  const reportingTime = `${hh12}:${min} ${ampm}`;
  const now = nowIso();

  db.prepare(
    `UPDATE jobs SET event_date = ?, reporting_time = ?, service_start = ?, updated_at = ? WHERE id = ?`
  ).run(eventDate, reportingTime, reportingTime, now, jobId);

  return {ok: true, event_date: eventDate, reporting_time: reportingTime};
}

export function respondAttendanceReminder(
  bookingId: number,
  workerId: number,
  coming: boolean
): {ok: true; status: string} | {ok: false; error: string; status: number} {
  const row = db
    .prepare(
      `SELECT a.id AS attendance_id, b.id AS booking_id, b.job_id, j.work_name, o.user_id AS org_user_id
       FROM attendance a
       JOIN bookings b ON b.id = a.booking_id
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ? AND b.worker_id = ?`
    )
    .get(bookingId, workerId) as
    | {
        attendance_id: number;
        booking_id: number;
        job_id: number;
        work_name: string;
        org_user_id: number;
      }
    | undefined;
  if (!row) return {ok: false, error: 'Attendance record not found.', status: 404};

  const now = nowIso();
  const nextAttStatus = coming ? 'Confirmed' : 'Cancelled';

  db.transaction(() => {
    db.prepare(
      `UPDATE attendance SET status = ?, responded_at = ?, flagged = 0, updated_at = ? WHERE id = ?`
    ).run(nextAttStatus, now, now, row.attendance_id);

    if (!coming) {
      db.prepare(`UPDATE bookings SET status = 'Cancelled', updated_at = ? WHERE id = ?`).run(
        now,
        row.booking_id
      );
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'cancellation', 'Worker Cannot Attend', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        row.org_user_id,
        `A worker cannot attend ${row.work_name}. Open Emergency Replacement to fill the vacancy.`,
        JSON.stringify({jobId: row.job_id, bookingId: row.booking_id}),
        now,
        now
      );
    }
  })();

  return {ok: true, status: nextAttStatus};
}

export function flagNoResponseAttendance(bookingId: number): void {
  const now = nowIso();
  db.prepare(
    `UPDATE attendance SET status = 'No response', flagged = 1, updated_at = ? WHERE booking_id = ? AND status = 'Pending'`
  ).run(now, bookingId);
}

export function markWorkerArrived(
  bookingId: number,
  workerId: number,
  lat: number | null,
  lng: number | null
): {ok: true; distanceMeters: number | null; verified: boolean} | {ok: false; error: string; status: number} {
  const row = db
    .prepare(
      `SELECT a.id AS attendance_id, j.lat AS job_lat, j.lng AS job_lng, j.work_name, o.user_id AS org_user_id
       FROM attendance a
       JOIN bookings b ON b.id = a.booking_id
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ? AND b.worker_id = ? AND b.status = 'Confirmed'`
    )
    .get(bookingId, workerId) as
    | {
        attendance_id: number;
        job_lat: number | null;
        job_lng: number | null;
        work_name: string;
        org_user_id: number;
      }
    | undefined;

  if (!row) return {ok: false, error: 'Confirmed booking not found.', status: 404};

  let distanceMeters: number | null = null;
  let verified = false;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    typeof row.job_lat === 'number' &&
    typeof row.job_lng === 'number'
  ) {
    distanceMeters = Math.round(haversineKm(lat, lng, row.job_lat, row.job_lng) * 1000);
    verified = distanceMeters <= config.geofenceRadiusMeters;
  }

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE attendance SET
        status = 'Arrived',
        arrived_at = ?,
        arrival_lat = ?,
        arrival_lng = ?,
        arrival_distance_m = ?,
        arrival_verified = ?,
        flagged = 0,
        updated_at = ?
       WHERE id = ?`
    ).run(now, lat, lng, distanceMeters, verified ? 1 : 0, now, row.attendance_id);

    const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(workerId) as {
      full_name: string;
    };
    const distNote =
      distanceMeters === null
        ? 'GPS not shared'
        : verified
        ? `Verified within ${distanceMeters}m`
        : `Outside geofence (${distanceMeters}m away)`;

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'arrival', 'Worker Arrived', ?, '{}', 0, 'unread', ?, ?)`
    ).run(
      row.org_user_id,
      `${worker.full_name} marked arrived for ${row.work_name} (${distNote}).`,
      now,
      now
    );
  })();

  return {ok: true, distanceMeters, verified};
}

export function getRankedReplacementCandidates(jobId: number) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as
    | {
        id: number;
        work_name: string;
        serve_type: string;
        event_date: string;
        city: string;
        lat: number | null;
        lng: number | null;
      }
    | undefined;
  if (!job) return [];

  const workers = db
    .prepare(
      `SELECT * FROM users
       WHERE role = 'worker' AND status = 'verified' AND phone != '9000000099'`
    )
    .all() as {
    id: number;
    full_name: string;
    phone: string;
    city: string;
    living_location: string;
    lat: number | null;
    lng: number | null;
    photo_url: string;
    work_category: string;
    skills: string;
    experience: string;
    availability: string;
    rating_avg: number;
    rating_count: number;
  }[];

  const candidates = [];
  for (const w of workers) {
    // Skip workers already booked/applied on this job or overlapping confirmed slot
    const busy = db
      .prepare(
        `SELECT b.id FROM bookings b
         JOIN jobs j ON j.id = b.job_id
         WHERE b.worker_id = ? AND b.status IN ('Confirmed', 'Pending admin review')
           AND (b.job_id = ? OR (j.event_date = ? AND j.serve_type = ?))`
      )
      .get(w.id, job.id, job.event_date, job.serve_type);
    if (busy) continue;

    const distKm =
      job.lat !== null && job.lng !== null && w.lat !== null && w.lng !== null
        ? haversineKm(job.lat, job.lng, w.lat, w.lng)
        : w.city.toLowerCase() === job.city.toLowerCase()
        ? 5.0
        : 25.0;

    let score = 100 - Math.min(60, distKm * 2);
    if (w.city.toLowerCase() === job.city.toLowerCase()) score += 15;
    if (w.availability.toLowerCase().includes('available')) score += 10;
    if (
      job.work_name.toLowerCase().includes('buffet') &&
      w.work_category.toLowerCase().includes('buffet')
    ) {
      score += 10;
    }
    score += Math.min(15, (w.rating_avg || 4) * 3);

    candidates.push({
      ...w,
      distance_km: distKm,
      score: Math.round(score),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 25);
}

export function triggerEmergencyReplacement(
  jobId: number,
  actorUserId: number,
  includeFlagged = false
): {ok: true; replacementId: number; vacanciesNeeded: number; offersSent: number} | {ok: false; error: string; status: number} {
  const job = db
    .prepare(
      `SELECT j.*, o.id AS org_id, o.business_name AS org_name
       FROM jobs j JOIN organisations o ON o.id = j.organisation_id WHERE j.id = ?`
    )
    .get(jobId) as
    | {
        id: number;
        org_id: number;
        org_name: string;
        work_name: string;
        location_name: string;
        event_date: string;
        reporting_time: string;
        total_pay: number;
        workers_required: number;
      }
    | undefined;
  if (!job) return {ok: false, error: 'Job not found.', status: 404};

  const confirmedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM bookings WHERE job_id = ? AND status IN ('Confirmed', 'Completed')`
      )
      .get(jobId) as {cnt: number}
  ).cnt;

  const flaggedCount = includeFlagged
    ? (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM attendance WHERE job_id = ? AND flagged = 1`
          )
          .get(jobId) as {cnt: number}
      ).cnt
    : 0;

  const vacanciesNeeded = Math.max(1, job.workers_required - confirmedCount + flaggedCount);
  const candidates = getRankedReplacementCandidates(jobId);
  const now = nowIso();

  const replacementId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO replacements (job_id, organisation_id, vacancies_needed, filled_count, triggered_by, status, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, 'open', ?, ?)`
      )
      .run(job.id, job.org_id, vacanciesNeeded, actorUserId, now, now);
    const repId = Number(info.lastInsertRowid);

    for (const c of candidates) {
      db.prepare(
        `INSERT INTO replacement_offers (replacement_id, job_id, worker_id, distance_km, score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).run(repId, job.id, c.id, c.distance_km, c.score, now, now);

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'emergency_replacement', 'EMERGENCY CATERING JOB AVAILABLE!', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        c.id,
        `${job.work_name} at ${job.location_name} (${c.distance_km} km away) · Rs ${job.total_pay} · Starts ${job.reporting_time} (${job.event_date}). ${vacanciesNeeded} spot(s) needed.`,
        JSON.stringify({replacementId: repId, jobId: job.id, distanceKm: c.distance_km}),
        now,
        now
      );
    }
    return repId;
  })();

  return {
    ok: true,
    replacementId,
    vacanciesNeeded,
    offersSent: candidates.length,
  };
}

export function listWorkerReplacementOffers(workerId: number) {
  return db
    .prepare(
      `SELECT ro.*, r.vacancies_needed, r.filled_count, r.status AS replacement_status,
              j.work_name, j.serve_type, j.event_date, j.reporting_time, j.location_name, j.total_pay,
              o.business_name AS org_name
       FROM replacement_offers ro
       JOIN replacements r ON r.id = ro.replacement_id
       JOIN jobs j ON j.id = ro.job_id
       JOIN organisations o ON o.id = j.organisation_id
       WHERE ro.worker_id = ?
       ORDER BY ro.created_at DESC`
    )
    .all(workerId);
}

export function listOrgReplacements(orgId: number) {
  const reps = db
    .prepare(
      `SELECT r.*, j.work_name, j.event_date, j.reporting_time, j.location_name
       FROM replacements r
       JOIN jobs j ON j.id = r.job_id
       WHERE r.organisation_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(orgId) as Record<string, unknown>[];

  return reps.map((rep) => {
    const offers = db
      .prepare(
        `SELECT ro.*, u.full_name AS worker_name, u.phone AS worker_phone, u.photo_url, u.work_category, u.rating_avg
         FROM replacement_offers ro
         JOIN users u ON u.id = ro.worker_id
         WHERE ro.replacement_id = ?
         ORDER BY CASE WHEN ro.status = 'accepted' THEN 0 ELSE 1 END, ro.score DESC`
      )
      .all(Number(rep.id));
    return {...rep, offers};
  });
}

export function respondReplacementOffer(
  offerId: number,
  workerId: number,
  accept: boolean
): {ok: true; status: string} | {ok: false; error: string; status: number} {
  const offer = db
    .prepare(
      `SELECT ro.*, r.vacancies_needed, r.filled_count, r.status AS rep_status,
              j.event_date, j.serve_type, j.work_name, o.user_id AS org_user_id
       FROM replacement_offers ro
       JOIN replacements r ON r.id = ro.replacement_id
       JOIN jobs j ON j.id = ro.job_id
       JOIN organisations o ON o.id = j.organisation_id
       WHERE ro.id = ? AND ro.worker_id = ?`
    )
    .get(offerId, workerId) as
    | {
        id: number;
        replacement_id: number;
        job_id: number;
        vacancies_needed: number;
        filled_count: number;
        rep_status: string;
        event_date: string;
        serve_type: string;
        work_name: string;
        org_user_id: number;
        status: string;
      }
    | undefined;

  if (!offer) return {ok: false, error: 'Replacement offer not found.', status: 404};
  if (offer.status !== 'pending') {
    return {ok: false, error: `Offer already ${offer.status}.`, status: 409};
  }

  const now = nowIso();
  if (!accept) {
    db.prepare(`UPDATE replacement_offers SET status = 'rejected', updated_at = ? WHERE id = ?`).run(
      now,
      offer.id
    );
    return {ok: true, status: 'rejected'};
  }

  try {
    db.transaction(() => {
      const freshRep = db
        .prepare('SELECT vacancies_needed, filled_count, status FROM replacements WHERE id = ?')
        .get(offer.replacement_id) as {vacancies_needed: number; filled_count: number; status: string};

      if (freshRep.status !== 'open' || freshRep.filled_count >= freshRep.vacancies_needed) {
        throw new Error('All replacement spots have already been filled.');
      }

      const conflict = db
        .prepare(
          `SELECT b.id FROM bookings b JOIN jobs j ON j.id = b.job_id
           WHERE b.worker_id = ? AND b.status = 'Confirmed' AND j.event_date = ? AND j.serve_type = ?`
        )
        .get(workerId, offer.event_date, offer.serve_type);
      if (conflict) {
        throw new Error('Already booked at this time.');
      }

      db.prepare(`UPDATE replacement_offers SET status = 'accepted', updated_at = ? WHERE id = ?`).run(
        now,
        offer.id
      );

      const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(workerId) as {
        full_name: string;
      };
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'emergency_accept', 'Replacement Worker Accepted!', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        offer.org_user_id,
        `${worker.full_name} accepted the emergency replacement for ${offer.work_name}. Tap to approve & confirm.`,
        JSON.stringify({replacementId: offer.replacement_id, offerId: offer.id}),
        now,
        now
      );
    })();
    return {ok: true, status: 'accepted'};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to accept replacement.',
      status: 409,
    };
  }
}

export function approveReplacementOffer(
  offerId: number,
  orgId: number
): {ok: true; bookingId: number} | {ok: false; error: string; status: number} {
  const offer = db
    .prepare(
      `SELECT ro.*, r.organisation_id, r.vacancies_needed, r.filled_count,
              j.work_name, j.event_date, j.serve_type, j.total_pay, j.workers_required
       FROM replacement_offers ro
       JOIN replacements r ON r.id = ro.replacement_id
       JOIN jobs j ON j.id = ro.job_id
       WHERE ro.id = ? AND r.organisation_id = ?`
    )
    .get(offerId, orgId) as
    | {
        id: number;
        replacement_id: number;
        job_id: number;
        worker_id: number;
        organisation_id: number;
        vacancies_needed: number;
        filled_count: number;
        status: string;
        work_name: string;
        event_date: string;
        serve_type: string;
        total_pay: number;
        workers_required: number;
      }
    | undefined;

  if (!offer) return {ok: false, error: 'Replacement offer not found.', status: 404};
  if (offer.status !== 'accepted') {
    return {ok: false, error: 'Worker must accept the offer before approval.', status: 400};
  }

  const now = nowIso();
  try {
    const bookingId = db.transaction(() => {
      const confirmedCnt = (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM bookings WHERE job_id = ? AND status IN ('Confirmed', 'Completed')`
          )
          .get(offer.job_id) as {cnt: number}
      ).cnt;

      if (confirmedCnt >= offer.workers_required) {
        throw new Error('Job is already full.');
      }

      const conflict = db
        .prepare(
          `SELECT b.id FROM bookings b JOIN jobs j ON j.id = b.job_id
           WHERE b.worker_id = ? AND b.status = 'Confirmed' AND j.event_date = ? AND j.serve_type = ?`
        )
        .get(offer.worker_id, offer.event_date, offer.serve_type);
      if (conflict) {
        throw new Error('Worker already has a confirmed booking at this time.');
      }

      const bInfo = db
        .prepare(
          `INSERT INTO bookings (
            job_id, organisation_id, worker_id, agreed_pay, is_demo, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, 'Confirmed', ?, ?)`
        )
        .run(offer.job_id, offer.organisation_id, offer.worker_id, offer.total_pay, now, now);
      const bid = Number(bInfo.lastInsertRowid);

      db.prepare(
        `INSERT INTO attendance (booking_id, job_id, worker_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Pending', ?, ?)`
      ).run(bid, offer.job_id, offer.worker_id, now, now);

      db.prepare(
        `INSERT INTO payment_records (
          booking_id, job_id, organisation_id, worker_id, offered_amount, agreed_amount, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)`
      ).run(bid, offer.job_id, offer.organisation_id, offer.worker_id, offer.total_pay, offer.total_pay, now, now);

      db.prepare(`UPDATE replacement_offers SET status = 'approved', updated_at = ? WHERE id = ?`).run(
        now,
        offer.id
      );

      const newFilled = offer.filled_count + 1;
      const repStatus = newFilled >= offer.vacancies_needed ? 'filled' : 'open';
      db.prepare(
        `UPDATE replacements SET filled_count = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(newFilled, repStatus, now, offer.replacement_id);

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'booking_confirmed', 'Emergency Replacement Confirmed!', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        offer.worker_id,
        `You are confirmed as an emergency replacement for ${offer.work_name} (${offer.event_date}).`,
        JSON.stringify({bookingId: bid, jobId: offer.job_id}),
        now,
        now
      );

      return bid;
    })();
    return {ok: true, bookingId};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to approve replacement.',
      status: 409,
    };
  }
}
