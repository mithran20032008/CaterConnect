import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';
import {paymentGateway} from '../services/paymentGateway.ts';
import {confirmBookingSlot} from './bookingRepo.ts';

// Manual Payments
export async function markPaymentPaid(
  paymentId: number,
  orgId: number,
  method: string
): Promise<{ok: true} | {ok: false; error: string; status: number}> {
  const row = db
    .prepare(
      `SELECT p.*, u.phone AS worker_phone, j.work_name
       FROM payment_records p
       JOIN users u ON u.id = p.worker_id
       JOIN jobs j ON j.id = p.job_id
       WHERE p.id = ? AND p.organisation_id = ?`
    )
    .get(paymentId, orgId) as
    | {id: number; booking_id: number; agreed_amount: number; worker_id: number; worker_phone: string; work_name: string}
    | undefined;
  if (!row) return {ok: false, error: 'Payment record not found.', status: 404};

  await paymentGateway.recordPayment({
    bookingId: row.booking_id,
    amount: row.agreed_amount,
    method: method || 'Cash / Direct UPI',
    workerPhone: row.worker_phone,
  });

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE payment_records SET status = 'paid_pending_confirm', payment_method = ?, paid_at = ?, updated_at = ? WHERE id = ?`
    ).run(method || 'Cash / Direct UPI', now, now, row.id);

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'payment', 'Payment Marked Paid', ?, ?, 0, 'unread', ?, ?)`
    ).run(
      row.worker_id,
      `Organisation marked Rs ${row.agreed_amount} paid for ${row.work_name}. Please confirm once received.`,
      JSON.stringify({paymentId: row.id}),
      now,
      now
    );
  })();

  return {ok: true};
}

export function confirmPaymentReceived(
  paymentId: number,
  workerId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const row = db
    .prepare('SELECT id FROM payment_records WHERE id = ? AND worker_id = ?')
    .get(paymentId, workerId) as {id: number} | undefined;
  if (!row) return {ok: false, error: 'Payment record not found.', status: 404};
  const now = nowIso();
  db.prepare(
    `UPDATE payment_records SET status = 'confirmed', worker_confirmed_at = ?, updated_at = ? WHERE id = ?`
  ).run(now, now, row.id);
  return {ok: true};
}

export function disputePayment(
  paymentId: number,
  workerId: number,
  reason: string
): {ok: true} | {ok: false; error: string; status: number} {
  if (!reason.trim()) return {ok: false, error: 'Please enter a dispute reason.', status: 400};
  const row = db
    .prepare(
      `SELECT p.id, o.user_id AS org_user_id, j.work_name
       FROM payment_records p
       JOIN organisations o ON o.id = p.organisation_id
       JOIN jobs j ON j.id = p.job_id
       WHERE p.id = ? AND p.worker_id = ?`
    )
    .get(paymentId, workerId) as {id: number; org_user_id: number; work_name: string} | undefined;
  if (!row) return {ok: false, error: 'Payment record not found.', status: 404};
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE payment_records SET status = 'disputed', dispute_reason = ?, updated_at = ? WHERE id = ?`
    ).run(reason.trim(), now, row.id);

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'payment_dispute', 'Payment Disputed', ?, '{}', 0, 'unread', ?, ?)`
    ).run(row.org_user_id, `Payment dispute raised for ${row.work_name}: ${reason.trim()}`, now, now);
  })();
  return {ok: true};
}

// Reviews & Ratings (only after Completed booking)
export function submitReview(
  bookingId: number,
  reviewerId: number,
  reviewerRole: 'worker' | 'organisation',
  scores: {
    punctuality: number;
    behaviour: number;
    work_quality: number;
    communication: number;
    payment_reliability: number;
    comment: string;
  }
): {ok: true} | {ok: false; error: string; status: number} {
  const booking = db
    .prepare(
      `SELECT b.*, o.user_id AS org_user_id
       FROM bookings b JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ?`
    )
    .get(bookingId) as
    | {id: number; job_id: number; organisation_id: number; org_user_id: number; worker_id: number; status: string}
    | undefined;

  if (!booking) return {ok: false, error: 'Booking not found.', status: 404};
  if (booking.status !== 'Completed') {
    return {ok: false, error: 'Ratings can only be submitted after the booking is completed.', status: 400};
  }

  let revieweeId = 0;
  if (reviewerRole === 'worker') {
    if (booking.worker_id !== reviewerId) return {ok: false, error: 'Forbidden.', status: 403};
    revieweeId = booking.org_user_id;
  } else {
    if (booking.org_user_id !== reviewerId) return {ok: false, error: 'Forbidden.', status: 403};
    revieweeId = booking.worker_id;
  }

  const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v || 5)));
  const p = clamp(scores.punctuality);
  const b = clamp(scores.behaviour);
  const wq = clamp(scores.work_quality);
  const c = clamp(scores.communication);
  const pr = clamp(scores.payment_reliability);
  const overall = Number(((p + b + wq + c + pr) / 5).toFixed(2));
  const now = nowIso();

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO reviews (
          booking_id, job_id, reviewer_id, reviewee_id, reviewer_role,
          punctuality, behaviour, work_quality, communication, payment_reliability,
          overall, comment, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`
      ).run(
        booking.id,
        booking.job_id,
        reviewerId,
        revieweeId,
        reviewerRole,
        p,
        b,
        wq,
        c,
        pr,
        overall,
        String(scores.comment || '').trim(),
        now,
        now
      );

      const agg = db
        .prepare('SELECT AVG(overall) AS avg_score, COUNT(*) AS cnt FROM reviews WHERE reviewee_id = ?')
        .get(revieweeId) as {avg_score: number; cnt: number};

      db.prepare(`UPDATE users SET rating_avg = ?, rating_count = ?, updated_at = ? WHERE id = ?`).run(
        Number((agg.avg_score || 0).toFixed(2)),
        agg.cnt,
        now,
        revieweeId
      );

      if (reviewerRole === 'worker') {
        db.prepare(
          `UPDATE organisations SET rating_avg = ?, rating_count = ?, updated_at = ? WHERE id = ?`
        ).run(Number((agg.avg_score || 0).toFixed(2)), agg.cnt, now, booking.organisation_id);
      }
    })();
    return {ok: true};
  } catch {
    return {ok: false, error: 'You have already reviewed this booking.', status: 409};
  }
}

// Support Tickets
export function createSupportTicket(
  userId: number,
  data: {booking_id?: number | null; category: string; description: string; attachment_url?: string}
) {
  if (!data.description.trim()) {
    return {ok: false as const, error: 'Description is required.', status: 400};
  }
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO support_tickets (user_id, booking_id, category, description, attachment_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(
      userId,
      data.booking_id || null,
      data.category.trim() || 'General',
      data.description.trim(),
      data.attachment_url || '',
      now,
      now
    );

  const ticket = db
    .prepare('SELECT * FROM support_tickets WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  return {ok: true as const, ticket};
}

export function listMyTickets(userId: number) {
  return db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

// Admin Panel Overview & Actions
export function getAdminDashboardData() {
  const workers = db
    .prepare("SELECT * FROM users WHERE role = 'worker' AND phone != '9000000099' ORDER BY created_at DESC")
    .all();
  const organisations = db
    .prepare('SELECT * FROM organisations WHERE is_demo = 0 ORDER BY created_at DESC')
    .all();
  const jobs = db
    .prepare(
      `SELECT j.*, o.business_name AS org_name,
              (SELECT COUNT(*) FROM bookings b WHERE b.job_id = j.id AND b.status = 'Confirmed') AS booked_count
       FROM jobs j JOIN organisations o ON o.id = j.organisation_id
       ORDER BY j.is_demo ASC, j.created_at DESC`
    )
    .all();
  const applications = db
    .prepare(
      `SELECT a.*, j.work_name, o.business_name AS org_name, u.full_name AS worker_name, g.name AS group_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN organisations o ON o.id = j.organisation_id
       LEFT JOIN users u ON u.id = a.worker_id
       LEFT JOIN groups g ON g.id = a.group_id
       WHERE a.is_demo = 0
       ORDER BY a.created_at DESC`
    )
    .all();
  const bookings = db
    .prepare(
      `SELECT b.*, j.work_name, j.event_date, j.reporting_time, j.serve_type,
              o.business_name AS org_name, u.full_name AS worker_name, u.phone AS worker_phone,
              g.name AS group_name,
              a.status AS attendance_status, a.arrival_verified, a.arrival_distance_m, a.flagged
       FROM bookings b
       JOIN jobs j ON j.id = b.job_id
       JOIN organisations o ON o.id = b.organisation_id
       JOIN users u ON u.id = b.worker_id
       LEFT JOIN groups g ON g.id = b.group_id
       LEFT JOIN attendance a ON a.booking_id = b.id
       WHERE b.is_demo = 0
       ORDER BY b.created_at DESC`
    )
    .all();
  const replacements = db
    .prepare(
      `SELECT r.*, j.work_name, o.business_name AS org_name
       FROM replacements r
       JOIN jobs j ON j.id = r.job_id
       JOIN organisations o ON o.id = r.organisation_id
       ORDER BY r.created_at DESC`
    )
    .all();
  const tickets = db
    .prepare(
      `SELECT t.*, u.full_name AS user_name, u.phone AS user_phone, u.role AS user_role
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC`
    )
    .all();
  const payments = db
    .prepare(
      `SELECT p.*, j.work_name, o.business_name AS org_name, u.full_name AS worker_name
       FROM payment_records p
       JOIN jobs j ON j.id = p.job_id
       JOIN organisations o ON o.id = p.organisation_id
       JOIN users u ON u.id = p.worker_id
       ORDER BY p.created_at DESC`
    )
    .all();

  const adminUser = db.prepare("SELECT phone FROM users WHERE role = 'admin' LIMIT 1").get() as
    | {phone: string}
    | undefined;

  return {
    workers,
    organisations,
    jobs,
    applications,
    bookings,
    replacements,
    tickets,
    payments,
    config: {
      autoVerifyMinutes: config.autoVerifyMinutes,
      maxGroupSize: config.maxGroupSize,
      geofenceRadiusMeters: config.geofenceRadiusMeters,
      seedDemoJobs: config.seedDemoJobs,
      autoConfirmBookings: config.autoConfirmBookings,
      brandColor: config.brandColor,
      isDefaultAdminPhone: adminUser?.phone === config.defaultAdminPhone,
      adminPhone: adminUser?.phone || config.defaultAdminPhone,
    },
  };
}

export function adminSetAccountStatus(
  userId: number,
  status: 'verified' | 'rejected' | 'suspended'
): {ok: true} | {ok: false; error: string; status: number} {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as
    | {id: number; role: string}
    | undefined;
  if (!user) return {ok: false, error: 'User not found.', status: 404};
  if (user.role === 'admin') return {ok: false, error: 'Cannot modify admin status.', status: 400};

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE users SET status = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?`
    ).run(status, status === 'verified' ? now : null, 'admin', now, userId);

    if (user.role === 'organisation') {
      db.prepare(
        `UPDATE organisations SET status = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE user_id = ?`
      ).run(status, status === 'verified' ? now : null, 'admin', now, userId);
    }

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'account_status', 'Account Status Updated', ?, '{}', 0, 'unread', ?, ?)`
    ).run(userId, `Your CaterConnect account status was updated to ${status} by admin.`, now, now);
  })();
  return {ok: true};
}

export function adminConfirmBooking(bookingId: number) {
  return confirmBookingSlot(bookingId);
}

export function adminReplySupportTicket(
  ticketId: number,
  responseText: string,
  status: 'in_progress' | 'resolved'
): {ok: true} | {ok: false; error: string; status: number} {
  const ticket = db.prepare('SELECT id, user_id, category FROM support_tickets WHERE id = ?').get(ticketId) as
    | {id: number; user_id: number; category: string}
    | undefined;
  if (!ticket) return {ok: false, error: 'Ticket not found.', status: 404};
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE support_tickets SET admin_response = ?, responded_at = ?, status = ?, updated_at = ? WHERE id = ?`
    ).run(responseText.trim(), now, status, now, ticketId);

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
       VALUES (?, 'support_reply', 'Support Reply Received', ?, ?, 0, 'unread', ?, ?)`
    ).run(
      ticket.user_id,
      `Admin replied to your ${ticket.category} ticket: ${responseText.trim()}`,
      JSON.stringify({ticketId}),
      now,
      now
    );
  })();
  return {ok: true};
}
