import express from 'express';
import {requireAuth, requireRole, type AuthedRequest} from '../middleware/auth.ts';
import {
  applyAsGroup,
  applyIndividual,
  cancelBooking,
  clearWorkerDemoApplications,
  completeBooking,
  listOrgApplications,
  listOrgBookings,
  listWorkerBookingsAndApps,
  orgAcceptApplication,
  orgRejectApplication,
  withdrawApplicationById,
  withdrawApplicationByJob,
} from '../repositories/bookingRepo.ts';
import {
  createGroup,
  inviteWorkerToGroup,
  listWorkerGroups,
  removeGroupMember,
  respondGroupInvite,
} from '../repositories/groupRepo.ts';
import {findOrgByUserId} from '../repositories/userRepo.ts';

export const groupBookingRouter = express.Router();

// Groups (Worker)
groupBookingRouter.get('/groups', requireAuth, requireRole('worker'), (req: AuthedRequest, res) => {
  res.json({groups: listWorkerGroups(req.auth!.userId)});
});

groupBookingRouter.post('/groups', requireAuth, requireRole('worker'), (req: AuthedRequest, res) => {
  const result = createGroup(
    req.auth!.userId,
    String(req.body?.name || ''),
    String(req.body?.city || 'Coimbatore')
  );
  if (result.ok === false) {
    res.status(result.status).json({error: result.error});
    return;
  }
  res.status(201).json({group: result.group});
});

groupBookingRouter.post(
  '/groups/:id/invite',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = inviteWorkerToGroup(
      Number(req.params.id),
      req.auth!.userId,
      String(req.body?.phone || '')
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json({ok: true, groups: listWorkerGroups(req.auth!.userId)});
  }
);

groupBookingRouter.post(
  '/groups/:id/respond',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = respondGroupInvite(
      Number(req.params.id),
      req.auth!.userId,
      Boolean(req.body?.accept)
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json({ok: true, groups: listWorkerGroups(req.auth!.userId)});
  }
);

groupBookingRouter.delete(
  '/groups/:id/members/:workerId',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = removeGroupMember(
      Number(req.params.id),
      req.auth!.userId,
      Number(req.params.workerId)
    );
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json({ok: true, groups: listWorkerGroups(req.auth!.userId)});
  }
);

// Applications & Bookings
groupBookingRouter.post(
  '/jobs/:id/apply',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const jobId = Number(req.params.id);
    const groupId = req.body?.groupId ? Number(req.body.groupId) : null;
    const note = String(req.body?.note || '');

    const result = groupId
      ? applyAsGroup(jobId, groupId, req.auth!.userId, note)
      : applyIndividual(jobId, req.auth!.userId, note);

    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.status(201).json({ok: true, applicationId: result.applicationId, isDemo: result.isDemo});
  }
);

groupBookingRouter.post(
  '/jobs/:id/withdraw',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = withdrawApplicationByJob(Number(req.params.id), req.auth!.userId);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json({ok: true});
  }
);

groupBookingRouter.post(
  '/applications/:id/withdraw',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const result = withdrawApplicationById(Number(req.params.id), req.auth!.userId);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json({ok: true});
  }
);

groupBookingRouter.delete(
  '/worker/demo-applications',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    const deletedCount = clearWorkerDemoApplications(req.auth!.userId);
    res.json({ok: true, deletedCount});
  }
);

groupBookingRouter.get(
  '/worker/bookings',
  requireAuth,
  requireRole('worker'),
  (req: AuthedRequest, res) => {
    res.json(listWorkerBookingsAndApps(req.auth!.userId));
  }
);

groupBookingRouter.get(
  '/org/applications',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    res.json({applications: listOrgApplications(org.id)});
  }
);

groupBookingRouter.post(
  '/org/applications/:id/accept',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    const selected = Array.isArray(req.body?.selectedWorkerIds)
      ? req.body.selectedWorkerIds.map((x: unknown) => Number(x)).filter(Number.isInteger)
      : undefined;
    const result = orgAcceptApplication(Number(req.params.id), org.id, selected);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

groupBookingRouter.post(
  '/org/applications/:id/reject',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    const result = orgRejectApplication(Number(req.params.id), org.id);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);

groupBookingRouter.get(
  '/org/bookings',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    res.json({bookings: listOrgBookings(org.id)});
  }
);

groupBookingRouter.post('/bookings/:id/cancel', requireAuth, (req: AuthedRequest, res) => {
  const result = cancelBooking(Number(req.params.id), req.auth!.userId, req.auth!.role);
  if (result.ok === false) {
    res.status(result.status).json({error: result.error});
    return;
  }
  res.json(result);
});

groupBookingRouter.post(
  '/org/bookings/:id/complete',
  requireAuth,
  requireRole('organisation'),
  (req: AuthedRequest, res) => {
    const org = findOrgByUserId(req.auth!.userId);
    if (!org) {
      res.status(404).json({error: 'Organisation not found.'});
      return;
    }
    const result = completeBooking(Number(req.params.id), org.id);
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }
    res.json(result);
  }
);
