import express from 'express';
import {requireAuth, requireRole, type AuthedRequest} from '../middleware/auth.ts';
import {
  adminConfirmBooking,
  adminReplySupportTicket,
  adminSetAccountStatus,
  confirmPaymentReceived,
  createSupportTicket,
  disputePayment,
  getAdminDashboardData,
  listMyTickets,
  markPaymentPaid,
  submitReview,
} from '../repositories/adminRepo.ts';
import {
  approveReplacementOffer,
  flagNoResponseAttendance,
  getRankedReplacementCandidates,
  listOrgReplacements,
  listWorkerReplacementOffers,
  markWorkerArrived,
  respondAttendanceReminder,
  respondReplacementOffer,
  setJobToStartInOneHour,
  triggerEmergencyReplacement,
  triggerReminderNowForBooking,
} from '../repositories/attendanceRepo.ts';
import {findOrgByUserId} from '../repositories/userRepo.ts';

export const attendanceAdminRouter = express.Router();

// Worker Attendance & GPS Arrival
attendanceAdminRouter.post(
  '/attendance/:bookingId/respond',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = respondAttendanceReminder(
      Number(req.params.bookingId),
      req.auth!.userId,
      Boolean(req.body?.coming)
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/attendance/:bookingId/arrived',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const lat = typeof req.body?.lat === 'number' ? req.body.lat : null;
    const lng = typeof req.body?.lng === 'number' ? req.body.lng : null;
    const result = markWorkerArrived(Number(req.params.bookingId), req.auth!.userId, lat, lng);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

// Dev/Test helper triggers for 1-hour attendance confirmation
attendanceAdminRouter.post(
  '/dev/bookings/:bookingId/trigger-reminder',
  requireAuth,
  (req: AuthedRequest, res) => {
    const result = triggerReminderNowForBooking(Number(req.params.bookingId));
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/dev/jobs/:jobId/start-in-one-hour',
  requireAuth,
  (req: AuthedRequest, res) => {
    const result = setJobToStartInOneHour(Number(req.params.jobId));
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/org/bookings/:bookingId/flag-no-response',
  requireAuth,
  requireRole('organisation', 'admin'),
  (req: AuthedRequest, res) => {
    flagNoResponseAttendance(Number(req.params.bookingId));
    res.json({ok: true});
  }
);

// Emergency Replacement
attendanceAdminRouter.get(
  '/org/jobs/:jobId/replacement-candidates',
  requireAuth,
  requireRole('organisation', 'admin'),
  (req: AuthedRequest, res) => {
    res.json({candidates: getRankedReplacementCandidates(Number(req.params.jobId))});
  }
);

attendanceAdminRouter.post(
  '/org/jobs/:jobId/trigger-replacement',
  requireAuth,
  requireRole('organisation', 'admin'),
  (req: AuthedRequest, res) => {
    const result = triggerEmergencyReplacement(
      Number(req.params.jobId),
      req.auth!.userId,
      Boolean(req.body?.includeFlagged)
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.get(
  '/org/replacements',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    res.json({replacements: listOrgReplacements(org.id)});
  }
);

attendanceAdminRouter.post(
  '/org/replacement-offers/:offerId/approve',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    const result = approveReplacementOffer(Number(req.params.offerId), org.id);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.get(
  '/worker/replacement-offers',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    res.json({offers: listWorkerReplacementOffers(req.auth!.userId)});
  }
);

attendanceAdminRouter.post(
  '/worker/replacement-offers/:offerId/respond',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = respondReplacementOffer(
      Number(req.params.offerId),
      req.auth!.userId,
      Boolean(req.body?.accept)
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

// Manual Payments
attendanceAdminRouter.post(
  '/org/payments/:paymentId/mark-paid',
  requireAuth,
  requireRole('organisation'),
  async (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    const result = await markPaymentPaid(
      Number(req.params.paymentId),
      org.id,
      String(req.body?.method || 'Cash / Direct UPI')
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/worker/payments/:paymentId/confirm',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = confirmPaymentReceived(Number(req.params.paymentId), req.auth!.userId);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/worker/payments/:paymentId/dispute',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = disputePayment(
      Number(req.params.paymentId),
      req.auth!.userId,
      String(req.body?.reason || '')
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

// Ratings / Reviews
attendanceAdminRouter.post(
  '/bookings/:bookingId/review',
  requireAuth,
  requireRole('worker', 'organisation'),
  (req: AuthedRequest, res) => {
    const result = submitReview(
      Number(req.params.bookingId),
      req.auth!.userId,
      req.auth!.role as 'worker' | 'organisation',
      {
        punctuality: Number(req.body?.punctuality || 5),
        behaviour: Number(req.body?.behaviour || 5),
        work_quality: Number(req.body?.work_quality || 5),
        communication: Number(req.body?.communication || 5),
        payment_reliability: Number(req.body?.payment_reliability || 5),
        comment: String(req.body?.comment || ''),
      }
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.status(201).json(result);
  }
);

// Support Tickets
attendanceAdminRouter.get('/support/tickets', requireAuth, (req: AuthedRequest, res) => {
  res.json({tickets: listMyTickets(req.auth!.userId)});
});

attendanceAdminRouter.post('/support/tickets', requireAuth, (req: AuthedRequest, res) => {
  const result = createSupportTicket(req.auth!.userId, {
    booking_id: req.body?.booking_id ? Number(req.body.booking_id) : null,
    category: String(req.body?.category || 'General'),
    description: String(req.body?.description || ''),
    attachment_url: String(req.body?.attachment_url || ''),
  });
  if (result.ok === false) {
    res.status(result.status).json({error: result.error});
    return;
  }
  res.status(201).json({ticket: result.ticket});
});

// Admin Panel Routes
attendanceAdminRouter.get(
  '/admin/dashboard',
  requireAuth,
  requireRole('admin'),
  (_req, res) => {
    res.json(getAdminDashboardData());
  }
);

attendanceAdminRouter.post(
  '/admin/users/:id/status',
  requireAuth,
  requireRole('admin'),
  (req: AuthedRequest, res) => {
    const status = req.body?.status;
    if (status !== 'verified' && status !== 'rejected' && status !== 'suspended') {
      res.status(400).json({error: 'Invalid status.'});
      return;
    }
    const result = adminSetAccountStatus(Number(req.params.id), status);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/admin/bookings/:id/confirm',
  requireAuth,
  requireRole('admin'),
  (req: AuthedRequest, res) => {
    const result = adminConfirmBooking(Number(req.params.id));
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

attendanceAdminRouter.post(
  '/admin/tickets/:id/reply',
  requireAuth,
  requireRole('admin'),
  (req: AuthedRequest, res) => {
    const status = req.body?.status === 'resolved' ? 'resolved' : 'in_progress';
    const result = adminReplySupportTicket(
      Number(req.params.id),
      String(req.body?.response || ''),
      status
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);
