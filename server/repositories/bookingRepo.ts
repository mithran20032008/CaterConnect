import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';

function hasTimeConflict(workerId: number, eventDate: string, serveType: string, excludeJobId?: number): boolean {
  const row = db
    .prepare(
      `SELECT b.id FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       WHERE b.worker_id = ?
         AND b.status IN ('Confirmed', 'Pending admin review')
         AND j.event_date = ?
         AND j.serve_type = ?
         AND (? IS NULL OR j.id != ?)`
    )
    .get(workerId, eventDate, serveType, excludeJobId ?? null, excludeJobId ?? null);
  return Boolean(row);
}

function getJobCore(jobId: number) {
  return db
    .prepare(
      `SELECT j.*, o.user_id AS org_user_id, o.business_name AS org_name
       FROM jobs j
       JOIN organisations o ON o.id = j.organisation_id
       WHERE j.id = ?`
    )
    .get(jobId) as
    | {
        id: number;
        organisation_id: number;
        org_user_id: number;
        org_name: string;
        work_name: string;
        serve_type: string;
        event_date: string;
        reporting_time: string;
        workers_required: number;
        total_pay: number;
        allow_partial_group: number;
        is_demo: number;
        status: string;
      }
    | undefined;
}

function liveRemainingSpots(jobId: number, workersRequired: number): number {
  const booked = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM bookings WHERE job_id = ? AND status IN ('Confirmed', 'Completed')`
      )
      .get(jobId) as {cnt: number}
  ).cnt;
  return Math.max(0, workersRequired - booked);
}

export function applyIndividual(
  jobId: number,
  workerId: number,
  note = ''
): {ok: true; applicationId: number; isDemo: boolean} | {ok: false; error: string; status: number} {
  const job = getJobCore(jobId);
  if (!job) return {ok: false, error: 'Job not found.', status: 404};
  if (job.status !== 'open') {
    return {ok: false, error: 'This job is no longer open.', status: 400};
  }

  const remaining = liveRemainingSpots(jobId, job.workers_required);
  if (remaining <= 0) {
    return {ok: false, error: 'Full - all booked', status: 409};
  }

  const existingApp = db
    .prepare(
      `SELECT a.id, a.status FROM applications a
       LEFT JOIN group_members gm ON gm.group_id = a.group_id AND gm.worker_id = ? AND gm.status = 'accepted'
       WHERE a.job_id = ? AND (a.worker_id = ? OR gm.worker_id = ?) AND a.status NOT IN ('Rejected', 'Withdrawn')`
    )
    .get(workerId, jobId, workerId, workerId) as {id: number; status: string} | undefined;
  if (existingApp) {
    return {ok: false, error: `Already ${existingApp.status.toLowerCase()} for this job.`, status: 409};
  }

  if (job.is_demo === 0 && hasTimeConflict(workerId, job.event_date, job.serve_type, jobId)) {
    return {ok: false, error: 'Already booked at this time', status: 409};
  }

  const now = nowIso();
  const isDemo = job.is_demo === 1 ? 1 : 0;
  const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(workerId) as {
    full_name: string;
  };

  const appId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO applications (job_id, worker_id, applicant_type, note, is_demo, status, created_at, updated_at)
         VALUES (?, ?, 'individual', ?, ?, 'Applied', ?, ?)`
      )
      .run(jobId, workerId, note.trim(), isDemo, now, now);

    if (isDemo === 0) {
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'application', 'New Job Application', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        job.org_user_id,
        `${worker.full_name} applied for ${job.work_name} (${job.event_date}).`,
        JSON.stringify({jobId}),
        now,
        now
      );
    }

    return Number(info.lastInsertRowid);
  })();

  return {ok: true, applicationId: appId, isDemo: isDemo === 1};
}

export function applyAsGroup(
  jobId: number,
  groupId: number,
  leaderId: number,
  note = ''
): {ok: true; applicationId: number; isDemo: boolean} | {ok: false; error: string; status: number} {
  const job = getJobCore(jobId);
  if (!job) return {ok: false, error: 'Job not found.', status: 404};
  if (job.status !== 'open') {
    return {ok: false, error: 'This job is no longer open.', status: 400};
  }

  const group = db
    .prepare('SELECT * FROM groups WHERE id = ? AND status = ?')
    .get(groupId, 'active') as {id: number; name: string; leader_id: number} | undefined;
  if (!group) return {ok: false, error: 'Group not found.', status: 404};
  if (group.leader_id !== leaderId) {
    return {ok: false, error: 'Only the group leader can apply for the group.', status: 403};
  }

  const members = db
    .prepare(
      `SELECT gm.worker_id, u.full_name
       FROM group_members gm
       JOIN users u ON u.id = gm.worker_id
       WHERE gm.group_id = ? AND gm.status = 'accepted'`
    )
    .all(groupId) as {worker_id: number; full_name: string}[];

  if (members.length < 2) {
    return {
      ok: false,
      error: 'A group must have at least 2 accepted members before applying.',
      status: 400,
    };
  }
  if (members.length > config.maxGroupSize) {
    return {
      ok: false,
      error: `Group size exceeds maximum limit of ${config.maxGroupSize}.`,
      status: 400,
    };
  }

  const remaining = liveRemainingSpots(jobId, job.workers_required);
  if (remaining <= 0) {
    return {ok: false, error: 'Full - all booked', status: 409};
  }
  if (job.allow_partial_group === 0 && members.length > remaining) {
    return {
      ok: false,
      error: `Your group has ${members.length} members, only ${remaining} spots remain, and partial group acceptance is off.`,
      status: 409,
    };
  }

  const existingApp = db
    .prepare(
      `SELECT id FROM applications WHERE job_id = ? AND group_id = ? AND status != 'Rejected'`
    )
    .get(jobId, groupId);
  if (existingApp) {
    return {ok: false, error: 'This group has already applied to this job.', status: 409};
  }

  if (job.is_demo === 0) {
    for (const m of members) {
      if (hasTimeConflict(m.worker_id, job.event_date, job.serve_type, jobId)) {
        return {
          ok: false,
          error: `${m.full_name} is already booked at this time (${job.event_date}, ${job.serve_type}).`,
          status: 409,
        };
      }
    }
  }

  const now = nowIso();
  const isDemo = job.is_demo === 1 ? 1 : 0;
  const appId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO applications (job_id, group_id, applicant_type, note, is_demo, status, created_at, updated_at)
         VALUES (?, ?, 'group', ?, ?, 'Applied', ?, ?)`
      )
      .run(jobId, groupId, note.trim(), isDemo, now, now);

    if (isDemo === 0) {
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'application', 'New Group Application', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        job.org_user_id,
        `Group "${group.name}" (${members.length} workers) applied for ${job.work_name}.`,
        JSON.stringify({jobId, groupId}),
        now,
        now
      );
    }

    return Number(info.lastInsertRowid);
  })();

  return {ok: true, applicationId: appId, isDemo: isDemo === 1};
}

export function withdrawApplicationById(
  applicationId: number,
  workerId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const app = db
    .prepare(
      `SELECT a.id, a.worker_id, a.group_id, a.applicant_type, a.status, g.leader_id
       FROM applications a
       LEFT JOIN groups g ON g.id = a.group_id
       WHERE a.id = ?`
    )
    .get(applicationId) as
    | {
        id: number;
        worker_id: number | null;
        group_id: number | null;
        applicant_type: string;
        status: string;
        leader_id: number | null;
      }
    | undefined;

  if (!app) return {ok: false, error: 'Application not found.', status: 404};
  const isOwner =
    (app.applicant_type === 'individual' && app.worker_id === workerId) ||
    (app.applicant_type === 'group' && app.leader_id === workerId);
  if (!isOwner) {
    return {
      ok: false,
      error:
        app.applicant_type === 'group'
          ? 'Only the group leader can withdraw this group application.'
          : 'Forbidden.',
      status: 403,
    };
  }
  if (app.status !== 'Applied') {
    return {ok: false, error: 'Only pending applications can be withdrawn.', status: 400};
  }

  db.prepare('DELETE FROM applications WHERE id = ?').run(app.id);
  return {ok: true};
}

export function withdrawApplicationByJob(
  jobId: number,
  workerId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const app = db
    .prepare(
      `SELECT a.id, a.applicant_type, a.worker_id, g.leader_id, a.status
       FROM applications a
       LEFT JOIN groups g ON g.id = a.group_id
       LEFT JOIN group_members gm ON gm.group_id = a.group_id AND gm.worker_id = ? AND gm.status = 'accepted'
       WHERE a.job_id = ? AND (a.worker_id = ? OR gm.worker_id = ?) AND a.status = 'Applied'
       ORDER BY a.id DESC
       LIMIT 1`
    )
    .get(workerId, jobId, workerId, workerId) as
    | {id: number; applicant_type: string; worker_id: number | null; leader_id: number | null; status: string}
    | undefined;

  if (!app) {
    return {ok: false, error: 'No pending application found for this job.', status: 404};
  }
  if (app.applicant_type === 'group' && app.leader_id !== workerId) {
    return {ok: false, error: 'Only the group leader can withdraw this group application.', status: 403};
  }
  db.prepare('DELETE FROM applications WHERE id = ?').run(app.id);
  return {ok: true};
}

export function clearWorkerDemoApplications(workerId: number): number {
  const info = db
    .prepare(
      `DELETE FROM applications
       WHERE is_demo = 1
         AND (worker_id = ? OR group_id IN (SELECT id FROM groups WHERE leader_id = ?))`
    )
    .run(workerId, workerId);
  return Number(info.changes || 0);
}

export function listOrgApplications(orgId: number) {
  const apps = db
    .prepare(
      `SELECT a.*, j.work_name, j.event_date, j.serve_type, j.total_pay, j.workers_required, j.allow_partial_group,
              u.full_name AS worker_name, u.phone AS worker_phone, u.photo_url AS worker_photo,
              u.work_category, u.skills, u.experience, u.rating_avg AS worker_rating, u.city AS worker_city,
              g.name AS group_name, g.leader_id AS group_leader_id
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN users u ON u.id = a.worker_id
       LEFT JOIN groups g ON g.id = a.group_id
       WHERE j.organisation_id = ? AND a.is_demo = 0 AND j.is_demo = 0
       ORDER BY a.created_at DESC`
    )
    .all(orgId) as Record<string, unknown>[];

  return apps.map((a) => {
    if (a.applicant_type === 'group' && a.group_id) {
      const members = db
        .prepare(
          `SELECT gm.worker_id, gm.role, u.full_name, u.phone, u.photo_url, u.work_category, u.skills, u.experience, u.rating_avg
           FROM group_members gm
           JOIN users u ON u.id = gm.worker_id
           WHERE gm.group_id = ? AND gm.status = 'accepted'`
        )
        .all(Number(a.group_id));
      return {...a, group_members: members};
    }
    return {...a, group_members: []};
  });
}

export function orgAcceptApplication(
  applicationId: number,
  orgId: number,
  selectedWorkerIds?: number[]
): {ok: true; bookingStatus: string; bookingIds: number[]} | {ok: false; error: string; status: number} {
  const app = db
    .prepare(
      `SELECT a.*, j.organisation_id, j.work_name, j.event_date, j.serve_type, j.workers_required, j.total_pay, j.allow_partial_group, j.is_demo AS job_is_demo
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND j.organisation_id = ?`
    )
    .get(applicationId, orgId) as
    | {
        id: number;
        job_id: number;
        worker_id: number | null;
        group_id: number | null;
        applicant_type: 'individual' | 'group';
        is_demo: number;
        job_is_demo: number;
        status: string;
        organisation_id: number;
        work_name: string;
        event_date: string;
        serve_type: string;
        workers_required: number;
        total_pay: number;
        allow_partial_group: number;
      }
    | undefined;

  if (!app) return {ok: false, error: 'Application not found.', status: 404};
  if (app.is_demo === 1 || app.job_is_demo === 1) {
    return {ok: false, error: 'Demo applications cannot be accepted.', status: 400};
  }
  if (app.status === 'Accepted' || app.status === 'Confirmed') {
    return {ok: false, error: 'This application has already been accepted.', status: 409};
  }

  let targetWorkers: number[] = [];
  if (app.applicant_type === 'individual' && app.worker_id) {
    targetWorkers = [app.worker_id];
  } else if (app.applicant_type === 'group' && app.group_id) {
    const members = db
      .prepare(
        `SELECT worker_id FROM group_members WHERE group_id = ? AND status = 'accepted'`
      )
      .all(app.group_id) as {worker_id: number}[];
    const memberIds = members.map((m) => m.worker_id);
    if (selectedWorkerIds && selectedWorkerIds.length > 0) {
      if (app.allow_partial_group === 0 && selectedWorkerIds.length < memberIds.length) {
        return {
          ok: false,
          error: 'Partial group acceptance is disabled for this job.',
          status: 400,
        };
      }
      targetWorkers = memberIds.filter((id) => selectedWorkerIds.includes(id));
    } else {
      targetWorkers = memberIds;
    }
  }

  if (targetWorkers.length === 0) {
    return {ok: false, error: 'No eligible workers to accept.', status: 400};
  }

  const now = nowIso();
  const nextBookingStatus = config.autoConfirmBookings ? 'Confirmed' : 'Pending admin review';

  try {
    const bookingIds = db.transaction(() => {
      const remaining = liveRemainingSpots(app.job_id, app.workers_required);
      if (targetWorkers.length > remaining) {
        throw new Error(`Only ${remaining} spots remaining for this job.`);
      }

      for (const wid of targetWorkers) {
        if (hasTimeConflict(wid, app.event_date, app.serve_type, app.job_id)) {
          const w = db.prepare('SELECT full_name FROM users WHERE id = ?').get(wid) as {
            full_name: string;
          };
          throw new Error(`${w.full_name} is already booked at this time.`);
        }
      }

      db.prepare(`UPDATE applications SET status = 'Accepted', updated_at = ? WHERE id = ?`).run(
        now,
        app.id
      );

      const createdIds: number[] = [];
      for (const wid of targetWorkers) {
        const bInfo = db
          .prepare(
            `INSERT INTO bookings (
              job_id, organisation_id, worker_id, group_id, application_id, agreed_pay, is_demo, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
          )
          .run(
            app.job_id,
            app.organisation_id,
            wid,
            app.group_id,
            app.id,
            app.total_pay,
            nextBookingStatus,
            now,
            now
          );
        const bid = Number(bInfo.lastInsertRowid);
        createdIds.push(bid);

        if (nextBookingStatus === 'Confirmed') {
          db.prepare(
            `INSERT INTO attendance (booking_id, job_id, worker_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'Pending', ?, ?)`
          ).run(bid, app.job_id, wid, now, now);

          db.prepare(
            `INSERT INTO payment_records (
              booking_id, job_id, organisation_id, worker_id, offered_amount, agreed_amount, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)`
          ).run(bid, app.job_id, app.organisation_id, wid, app.total_pay, app.total_pay, now, now);
        }

        db.prepare(
          `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
           VALUES (?, 'booking', ?, ?, ?, 0, 'unread', ?, ?)`
        ).run(
          wid,
          nextBookingStatus === 'Confirmed' ? 'Booking Confirmed!' : 'Application Accepted!',
          nextBookingStatus === 'Confirmed'
            ? `Your slot for ${app.work_name} (${app.event_date}) is confirmed.`
            : `Your application for ${app.work_name} was accepted and is awaiting CaterConnect confirmation.`,
          JSON.stringify({jobId: app.job_id, bookingId: bid}),
          now,
          now
        );
      }

      if (nextBookingStatus === 'Pending admin review') {
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as {id: number}[];
        for (const adm of admins) {
          db.prepare(
            `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
             VALUES (?, 'admin_confirm', 'Slot Confirmation Needed', ?, ?, 0, 'unread', ?, ?)`
          ).run(
            adm.id,
            `Confirm ${createdIds.length} accepted booking(s) for ${app.work_name}.`,
            JSON.stringify({jobId: app.job_id}),
            now,
            now
          );
        }
      }

      return createdIds;
    })();

    return {ok: true, bookingStatus: nextBookingStatus, bookingIds};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to accept application.',
      status: 409,
    };
  }
}

export function orgRejectApplication(
  applicationId: number,
  orgId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const app = db
    .prepare(
      `SELECT a.id, a.worker_id, a.group_id, j.work_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND j.organisation_id = ?`
    )
    .get(applicationId, orgId) as
    | {id: number; worker_id: number | null; group_id: number | null; work_name: string}
    | undefined;
  if (!app) return {ok: false, error: 'Application not found.', status: 404};
  const now = nowIso();
  db.prepare(`UPDATE applications SET status = 'Rejected', updated_at = ? WHERE id = ?`).run(
    now,
    app.id
  );
  if (app.worker_id) {
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'application', 'Application Update', ?, '{}', 0, 'unread', ?, ?)`
    ).run(app.worker_id, `Your application for ${app.work_name} was not selected.`, now, now);
  }
  return {ok: true};
}

export function confirmBookingSlot(
  bookingId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const booking = db
    .prepare(
      `SELECT b.*, j.work_name, j.event_date, j.serve_type, j.workers_required, o.user_id AS org_user_id
       FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ?`
    )
    .get(bookingId) as
    | {
        id: number;
        job_id: number;
        organisation_id: number;
        org_user_id: number;
        worker_id: number;
        agreed_pay: number;
        status: string;
        work_name: string;
        event_date: string;
        serve_type: string;
        workers_required: number;
      }
    | undefined;

  if (!booking) return {ok: false, error: 'Booking not found.', status: 404};
  if (booking.status === 'Confirmed') return {ok: true};

  const now = nowIso();
  try {
    db.transaction(() => {
      const remaining = liveRemainingSpots(booking.job_id, booking.workers_required);
      if (remaining <= 0) {
        throw new Error('This job has no remaining spots left.');
      }
      const conflict = db
        .prepare(
          `SELECT b.id FROM bookings b
           JOIN jobs j ON j.id = b.job_id
           WHERE b.worker_id = ? AND b.status = 'Confirmed' AND j.event_date = ? AND j.serve_type = ? AND b.id != ?`
        )
        .get(booking.worker_id, booking.event_date, booking.serve_type, booking.id);
      if (conflict) {
        throw new Error('Worker already has a confirmed booking at this time.');
      }

      db.prepare(`UPDATE bookings SET status = 'Confirmed', updated_at = ? WHERE id = ?`).run(
        now,
        booking.id
      );

      if (booking.id) {
        db.prepare(
          `INSERT OR IGNORE INTO attendance (booking_id, job_id, worker_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 'Pending', ?, ?)`
        ).run(booking.id, booking.job_id, booking.worker_id, now, now);

        db.prepare(
          `INSERT OR IGNORE INTO payment_records (
            booking_id, job_id, organisation_id, worker_id, offered_amount, agreed_amount, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)`
        ).run(
          booking.id,
          booking.job_id,
          booking.organisation_id,
          booking.worker_id,
          booking.agreed_pay,
          booking.agreed_pay,
          now,
          now
        );
      }

      const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(booking.worker_id) as {
        full_name: string;
      };

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'booking_confirmed', 'Booking Confirmed!', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        booking.worker_id,
        `CaterConnect confirmed your slot for ${booking.work_name} on ${booking.event_date}.`,
        JSON.stringify({bookingId: booking.id, jobId: booking.job_id}),
        now,
        now
      );

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
         VALUES (?, 'booking_confirmed', 'Worker Slot Confirmed', ?, ?, 0, 'unread', ?, ?)`
      ).run(
        booking.org_user_id,
        `CaterConnect confirmed ${worker.full_name} for ${booking.work_name}.`,
        JSON.stringify({bookingId: booking.id, jobId: booking.job_id}),
        now,
        now
      );
    })();
    return {ok: true};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to confirm booking.',
      status: 409,
    };
  }
}

export function listWorkerBookingsAndApps(workerId: number) {
  const bookings = db
    .prepare(
      `SELECT b.*, j.work_name, j.serve_type, j.event_date, j.reporting_time, j.service_start, j.service_end,
              j.location_name, j.city, j.lat, j.lng, j.total_pay, j.base_pay, j.bus_fare,
              o.business_name AS org_name, o.user_id AS org_user_id, o.phone AS org_phone, o.logo_url AS org_logo,
              a.status AS attendance_status, a.reminder_sent_at, a.responded_at, a.arrived_at,
              a.arrival_verified, a.arrival_distance_m, a.flagged,
              p.id AS payment_id, p.status AS payment_status, p.payment_method, p.paid_at, p.worker_confirmed_at, p.dispute_reason,
              r.id AS my_review_id
       FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       LEFT JOIN attendance a ON a.booking_id = b.id
       LEFT JOIN payment_records p ON p.booking_id = b.id
       LEFT JOIN reviews r ON r.booking_id = b.id AND r.reviewer_id = ?
       WHERE b.worker_id = ? AND b.is_demo = 0
       ORDER BY j.event_date ASC, b.created_at DESC`
    )
    .all(workerId, workerId);

  const applications = db
    .prepare(
      `SELECT a.*, j.work_name, j.serve_type, j.event_date, j.reporting_time, j.location_name, j.total_pay,
              j.is_demo AS job_is_demo,
              o.business_name AS org_name, g.name AS group_name, g.leader_id AS group_leader_id
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN organisations o ON o.id = j.organisation_id
       LEFT JOIN groups g ON g.id = a.group_id
       LEFT JOIN group_members gm ON gm.group_id = a.group_id AND gm.worker_id = ? AND gm.status = 'accepted'
       WHERE a.worker_id = ? OR gm.worker_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(workerId, workerId, workerId);

  return {bookings, applications};
}

export function listOrgBookings(orgId: number) {
  return db
    .prepare(
      `SELECT b.*, j.work_name, j.serve_type, j.event_date, j.reporting_time, j.location_name, j.workers_required,
              u.full_name AS worker_name, u.phone AS worker_phone, u.photo_url AS worker_photo,
              u.work_category, u.rating_avg AS worker_rating,
              g.name AS group_name,
              a.status AS attendance_status, a.reminder_sent_at, a.responded_at, a.arrived_at,
              a.arrival_verified, a.arrival_distance_m, a.flagged,
              p.id AS payment_id, p.status AS payment_status, p.payment_method, p.paid_at, p.worker_confirmed_at, p.dispute_reason,
              r.id AS my_review_id
       FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       JOIN users u ON u.id = b.worker_id
       LEFT JOIN groups g ON g.id = b.group_id
       LEFT JOIN attendance a ON a.booking_id = b.id
       LEFT JOIN payment_records p ON p.booking_id = b.id
       LEFT JOIN reviews r ON r.booking_id = b.id AND r.reviewer_id = (SELECT user_id FROM organisations WHERE id = ?)
       WHERE b.organisation_id = ? AND b.is_demo = 0
       ORDER BY j.event_date ASC, b.created_at DESC`
    )
    .all(orgId, orgId);
}

export function cancelBooking(
  bookingId: number,
  actorUserId: number,
  actorRole: 'worker' | 'organisation' | 'admin'
): {ok: true; jobId: number} | {ok: false; error: string; status: number} {
  const row = db
    .prepare(
      `SELECT b.*, j.work_name, o.user_id AS org_user_id
       FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ?`
    )
    .get(bookingId) as
    | {
        id: number;
        job_id: number;
        worker_id: number;
        org_user_id: number;
        work_name: string;
        status: string;
      }
    | undefined;

  if (!row) return {ok: false, error: 'Booking not found.', status: 404};
  if (actorRole === 'worker' && row.worker_id !== actorUserId) {
    return {ok: false, error: 'Forbidden.', status: 403};
  }
  if (actorRole === 'organisation' && row.org_user_id !== actorUserId) {
    return {ok: false, error: 'Forbidden.', status: 403};
  }

  const now = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'Cancelled', updated_at = ? WHERE id = ?`).run(
      now,
      row.id
    );
    db.prepare(`UPDATE attendance SET status = 'Cancelled', updated_at = ? WHERE booking_id = ?`).run(
      now,
      row.id
    );
    const notifyTarget = actorRole === 'worker' ? row.org_user_id : row.worker_id;
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'cancellation', 'Booking Cancelled', ?, ?, 0, 'unread', ?, ?)`
    ).run(
      notifyTarget,
      `A booking for ${row.work_name} was cancelled. You can request emergency replacements if needed.`,
      JSON.stringify({jobId: row.job_id, bookingId: row.id}),
      now,
      now
    );
  })();

  return {ok: true, jobId: row.job_id};
}

export function completeBooking(
  bookingId: number,
  orgId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const row = db
    .prepare('SELECT id, worker_id, job_id FROM bookings WHERE id = ? AND organisation_id = ?')
    .get(bookingId, orgId) as {id: number; worker_id: number; job_id: number} | undefined;
  if (!row) return {ok: false, error: 'Booking not found.', status: 404};

  const now = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'Completed', updated_at = ? WHERE id = ?`).run(
      now,
      row.id
    );
    db.prepare(`UPDATE attendance SET status = 'Completed', updated_at = ? WHERE booking_id = ?`).run(
      now,
      row.id
    );
  })();
  return {ok: true};
}
