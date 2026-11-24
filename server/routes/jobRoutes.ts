import express from 'express';
import {optionalAuth, requireAuth, requireRole, type AuthedRequest} from '../middleware/auth.ts';
import {
  createJob,
  deleteJobBeforeBooking,
  getJobById,
  listOpenJobs,
  listOrgJobs,
  listSavedJobs,
  listUserNotifications,
  markNotificationsRead,
  toggleSaveJob,
  updateJob,
} from '../repositories/jobRepo.ts';
import {autoVerifyIfDue, findOrgByUserId, findUserById} from '../repositories/userRepo.ts';

export const jobRouter = express.Router();

jobRouter.get('/jobs', optionalAuth, (req: AuthedRequest, res) => {
  try {
    const q = req.query;
    const viewer = req.auth ? findUserById(req.auth.userId) : undefined;
    const lat =
      typeof q.lat === 'string' && q.lat !== '' ? Number(q.lat) : viewer?.lat ?? null;
    const lng =
      typeof q.lng === 'string' && q.lng !== '' ? Number(q.lng) : viewer?.lng ?? null;

    const jobs = listOpenJobs(
      {
        search: typeof q.search === 'string' ? q.search : undefined,
        city: typeof q.city === 'string' ? q.city : undefined,
        role: typeof q.role === 'string' ? q.role : undefined,
        serveType: typeof q.serveType === 'string' ? q.serveType : undefined,
        minPay: typeof q.minPay === 'string' && q.minPay !== '' ? Number(q.minPay) : undefined,
        maxDistanceKm:
          typeof q.maxDistanceKm === 'string' && q.maxDistanceKm !== ''
            ? Number(q.maxDistanceKm)
            : undefined,
        date: typeof q.date === 'string' ? q.date : undefined,
        onlyOpen: q.onlyOpen === 'true' || q.onlyOpen === '1',
        sort: q.sort === 'nearest' ? 'nearest' : 'newest',
        lat: Number.isFinite(lat as number) ? (lat as number) : null,
        lng: Number.isFinite(lng as number) ? (lng as number) : null,
      },
      req.auth?.userId
    );

    res.json({jobs, total: jobs.length});
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Failed to load jobs.'});
  }
});

jobRouter.get('/jobs/saved', requireAuth, (req: AuthedRequest, res) => {
  const jobs = listSavedJobs(req.auth!.userId);
  res.json({jobs});
});

jobRouter.get('/jobs/:id', optionalAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({error: 'Invalid job ID.'});
    return;
  }
  const viewer = req.auth ? findUserById(req.auth.userId) : undefined;
  const lat =
    typeof req.query.lat === 'string' && req.query.lat !== ''
      ? Number(req.query.lat)
      : viewer?.lat ?? null;
  const lng =
    typeof req.query.lng === 'string' && req.query.lng !== ''
      ? Number(req.query.lng)
      : viewer?.lng ?? null;
  const job = getJobById(id, req.auth?.userId, lat, lng);
  if (!job) {
    res.status(404).json({error: 'Job not found.'});
    return;
  }
  res.json({job});
});

jobRouter.post('/jobs/:id/save', requireAuth, requireRole('worker'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({error: 'Invalid job ID.'});
    return;
  }
  const saved = toggleSaveJob(req.auth!.userId, id);
  res.json({saved});
});

jobRouter.get('/org/jobs', requireAuth, requireRole('organisation'), (req: AuthedRequest, res) => {
  const org = findOrgByUserId(req.auth!.userId);
  if (!org) {
    res.status(404).json({error: 'Organisation profile not found.'});
    return;
  }
  res.json({jobs: listOrgJobs(org.id)});
});

jobRouter.post('/jobs', requireAuth, requireRole('organisation'), (req: AuthedRequest, res) => {
  try {
    autoVerifyIfDue(req.auth!.userId);
    const user = findUserById(req.auth!.userId);
    const org = findOrgByUserId(req.auth!.userId);
    if (!user || !org) {
      res.status(404).json({error: 'Organisation account not found.'});
      return;
    }
    if (user.status !== 'verified' || org.status !== 'verified') {
      res.status(403).json({
        error: 'Your organisation account must be verified before posting a job.',
      });
      return;
    }

    const b = req.body || {};
    if (!String(b.work_name || '').trim()) {
      res.status(400).json({error: 'Work name is required.'});
      return;
    }
    if (!String(b.serve_type || '').trim()) {
      res.status(400).json({error: 'Serve type is required.'});
      return;
    }
    if (!String(b.event_date || '').trim()) {
      res.status(400).json({error: 'Event date is required.'});
      return;
    }
    if (!String(b.reporting_time || '').trim()) {
      res.status(400).json({error: 'Reporting time is required.'});
      return;
    }
    if (!String(b.location_name || '').trim()) {
      res.status(400).json({error: 'Location name is required.'});
      return;
    }
    const workersReq = Number(b.workers_required);
    if (!Number.isFinite(workersReq) || workersReq < 1) {
      res.status(400).json({error: 'Workers required must be at least 1.'});
      return;
    }
    const basePay = Number(b.base_pay);
    if (!Number.isFinite(basePay) || basePay <= 0) {
      res.status(400).json({error: 'Base pay must be greater than 0.'});
      return;
    }

    const job = createJob(org.id, {
      work_name: String(b.work_name),
      serve_type: String(b.serve_type),
      event_date: String(b.event_date),
      reporting_time: String(b.reporting_time),
      service_start: String(b.service_start || ''),
      service_end: String(b.service_end || ''),
      location_name: String(b.location_name),
      city: String(b.city || org.city || 'Coimbatore'),
      lat: typeof b.lat === 'number' ? b.lat : org.lat,
      lng: typeof b.lng === 'number' ? b.lng : org.lng,
      workers_required: workersReq,
      dress_code: String(b.dress_code || ''),
      base_pay: basePay,
      bus_fare: Number(b.bus_fare || 0),
      food_provided: Boolean(b.food_provided),
      transport_provided: Boolean(b.transport_provided),
      special_instructions: String(b.special_instructions || ''),
      show_contact: Boolean(b.show_contact),
      contact_phone: String(b.contact_phone || org.contact_details || org.phone),
      allow_partial_group: b.allow_partial_group !== false,
      is_urgent: Boolean(b.is_urgent),
    });

    res.status(201).json({job});
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Failed to post job.'});
  }
});

jobRouter.put('/jobs/:id', requireAuth, requireRole('organisation'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const org = findOrgByUserId(req.auth!.userId);
  if (!org) {
    res.status(404).json({error: 'Organisation not found.'});
    return;
  }
  const result = updateJob(id, org.id, req.body || {});
  if (result.ok === false) {
    res.status(result.status).json({error: result.error});
    return;
  }
  res.json({job: result.job});
});

jobRouter.delete('/jobs/:id', requireAuth, requireRole('organisation'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const org = findOrgByUserId(req.auth!.userId);
  if (!org) {
    res.status(404).json({error: 'Organisation not found.'});
    return;
  }
  const result = deleteJobBeforeBooking(id, org.id);
  if (result.ok === false) {
    res.status(result.status).json({error: result.error});
    return;
  }
  res.json({ok: true});
});

jobRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const data = listUserNotifications(req.auth!.userId);
  res.json(data);
});

jobRouter.post('/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  const nid = typeof req.body?.id === 'number' ? req.body.id : undefined;
  markNotificationsRead(req.auth!.userId, nid);
  const data = listUserNotifications(req.auth!.userId);
  res.json(data);
});
