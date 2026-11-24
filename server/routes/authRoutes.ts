import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {config, isDemoPhone} from '../config.ts';
import {
  clearSessionCookie,
  extractAuth,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  type AuthedRequest,
} from '../middleware/auth.ts';
import {
  createAndSendOtp,
  normalizeIndianPhone,
  registerOrgWithOtp,
  registerWorkerWithOtp,
  verifyOtpAndLogin,
} from '../repositories/authRepo.ts';
import {
  autoVerifyIfDue,
  findOrgByUserId,
  findUserById,
  findUserByPhone,
  updateOrgProfile,
  updateWorkerProfile,
} from '../repositories/userRepo.ts';

export const authRouter = express.Router();

const sendCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many code requests. Please wait a few minutes and try again.'},
});

const phoneCooldownMap = new Map<string, number>();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadsDir, {recursive: true});
    cb(null, config.uploadsDir);
  },
  filename: (_req, file, cb) => {
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const ext = extMap[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {fileSize: 3 * 1024 * 1024},
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, or WebP images up to 3 MB are allowed.'));
    }
  },
});

authRouter.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({error: err.message || 'Image upload failed.'});
      return;
    }
    if (!req.file) {
      res.status(400).json({error: 'Please select an image file to upload.'});
      return;
    }
    const safeFilename = path.basename(req.file.filename);
    res.json({url: `/uploads/${safeFilename}`});
  });
});

authRouter.post('/auth/send-code', sendCodeLimiter, async (req, res) => {
  try {
    const phone = normalizeIndianPhone(req.body?.phone || '');
    if (!phone) {
      res.status(400).json({error: 'Enter a valid 10-digit mobile number'});
      return;
    }
    if (isDemoPhone(phone)) {
      res.status(403).json({error: 'Demo phone numbers cannot log in or register.'});
      return;
    }

    const mode = req.body?.mode === 'register' ? 'register' : 'login';
    const existing = findUserByPhone(phone);
    if (mode === 'register' && existing) {
      res.status(409).json({
        error: 'Already registered, please log in',
        code: 'ALREADY_REGISTERED',
      });
      return;
    }
    if (mode === 'login' && !existing) {
      res.status(404).json({
        error: 'No account found for this number. Please register first.',
        code: 'NOT_REGISTERED',
      });
      return;
    }

    const lastSent = phoneCooldownMap.get(phone) || 0;
    const elapsedSec = Math.floor((Date.now() - lastSent) / 1000);
    if (elapsedSec < 30 && req.body?.force !== true) {
      // Allow re-request after 30s; if under 30s return helpful remaining cooldown
      const wait = 30 - elapsedSec;
      res.status(429).json({
        error: `Please wait ${wait} seconds before requesting a new code.`,
        retryAfterSeconds: wait,
      });
      return;
    }

    phoneCooldownMap.set(phone, Date.now());
    const result = await createAndSendOtp(phone);
    res.json({
      ok: true,
      phone,
      testMode: true,
      testCode: result.testCode,
      provider: result.provider,
      expiresInSeconds: 300,
    });
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Failed to send code.'});
  }
});

authRouter.post('/auth/register-worker', (req, res) => {
  try {
    const phone = normalizeIndianPhone(req.body?.phone || '');
    if (!phone) {
      res.status(400).json({error: 'Enter a valid 10-digit mobile number'});
      return;
    }
    const result = registerWorkerWithOtp({
      phone,
      code: String(req.body?.code || ''),
      full_name: String(req.body?.full_name || ''),
      address: String(req.body?.address || ''),
      living_location: String(req.body?.living_location || ''),
      lat: typeof req.body?.lat === 'number' ? req.body.lat : null,
      lng: typeof req.body?.lng === 'number' ? req.body.lng : null,
      city: String(req.body?.city || 'Coimbatore'),
      photo_url: String(req.body?.photo_url || ''),
      work_category: String(req.body?.work_category || ''),
      skills: String(req.body?.skills || ''),
      experience: String(req.body?.experience || ''),
      preferred_areas: String(req.body?.preferred_areas || ''),
      availability: String(req.body?.availability || 'Available'),
      language: String(req.body?.language || 'en'),
    });

    if (result.ok === false) {
      res.status(result.status).json({error: result.error, code: result.code});
      return;
    }

    const rememberMe = Boolean(req.body?.keepSignedIn);
    const token = signSessionToken(
      {userId: result.user.id, role: result.user.role, phone: result.user.phone},
      rememberMe
    );
    setSessionCookie(req, res, token, rememberMe);
    res.status(201).json({
      user: result.user,
      organisation: null,
      autoVerifyMinutes: config.autoVerifyMinutes,
      token,
    });
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Registration failed.'});
  }
});

authRouter.post('/auth/register-organisation', (req, res) => {
  try {
    const phone = normalizeIndianPhone(req.body?.phone || '');
    if (!phone) {
      res.status(400).json({error: 'Enter a valid 10-digit mobile number'});
      return;
    }
    const result = registerOrgWithOtp({
      phone,
      code: String(req.body?.code || ''),
      owner_name: String(req.body?.owner_name || ''),
      business_name: String(req.body?.business_name || ''),
      category: String(req.body?.category || ''),
      address: String(req.body?.address || ''),
      city: String(req.body?.city || 'Coimbatore'),
      lat: typeof req.body?.lat === 'number' ? req.body.lat : null,
      lng: typeof req.body?.lng === 'number' ? req.body.lng : null,
      logo_url: String(req.body?.logo_url || ''),
      contact_details: String(req.body?.contact_details || ''),
      language: String(req.body?.language || 'en'),
    });

    if (result.ok === false) {
      res.status(result.status).json({error: result.error, code: result.code});
      return;
    }

    const rememberMe = Boolean(req.body?.keepSignedIn);
    const token = signSessionToken(
      {userId: result.user.id, role: result.user.role, phone: result.user.phone},
      rememberMe
    );
    setSessionCookie(req, res, token, rememberMe);
    res.status(201).json({
      user: result.user,
      organisation: result.organisation,
      autoVerifyMinutes: config.autoVerifyMinutes,
      token,
    });
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Registration failed.'});
  }
});

authRouter.post('/auth/login', (req, res) => {
  try {
    const phone = normalizeIndianPhone(req.body?.phone || '');
    if (!phone) {
      res.status(400).json({error: 'Enter a valid 10-digit mobile number'});
      return;
    }
    const result = verifyOtpAndLogin(phone, String(req.body?.code || ''));
    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }

    // Auto-verify on login if time has passed even across server restarts
    autoVerifyIfDue(result.user.id);
    const freshUser = findUserById(result.user.id) || result.user;
    const organisation =
      freshUser.role === 'organisation' ? findOrgByUserId(freshUser.id) || null : null;

    const rememberMe = Boolean(req.body?.keepSignedIn);
    const token = signSessionToken(
      {userId: freshUser.id, role: freshUser.role, phone: freshUser.phone},
      rememberMe
    );
    setSessionCookie(req, res, token, rememberMe);
    res.json({
      user: freshUser,
      organisation,
      autoVerifyMinutes: config.autoVerifyMinutes,
      token,
    });
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Login failed.'});
  }
});

authRouter.post('/auth/refresh', (req: AuthedRequest, res) => {
  const payload = extractAuth(req);
  if (!payload) {
    res.status(401).json({error: 'Session expired. Please log in to continue.'});
    return;
  }
  autoVerifyIfDue(payload.userId);
  const freshUser = findUserById(payload.userId);
  if (!freshUser) {
    res.status(401).json({error: 'Session expired. Please log in to continue.'});
    return;
  }
  const organisation =
    freshUser.role === 'organisation' ? findOrgByUserId(freshUser.id) || null : null;
  const rememberMe = payload.rememberMe !== false;
  const token = signSessionToken(
    {userId: freshUser.id, role: freshUser.role, phone: freshUser.phone},
    rememberMe
  );
  setSessionCookie(req, res, token, rememberMe);
  res.json({
    ok: true,
    user: freshUser,
    organisation,
    autoVerifyMinutes: config.autoVerifyMinutes,
    token,
  });
});

authRouter.post('/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ok: true});
});

authRouter.put('/profile', requireAuth, (req: AuthedRequest, res) => {
  try {
    const auth = req.auth!;
    const body = req.body || {};
    if (auth.role === 'organisation') {
      const updated = updateOrgProfile(auth.userId, {
        owner_name: body.owner_name,
        business_name: body.business_name,
        category: body.category,
        address: body.address,
        city: body.city,
        lat: typeof body.lat === 'number' ? body.lat : undefined,
        lng: typeof body.lng === 'number' ? body.lng : undefined,
        logo_url: body.logo_url,
        contact_details: body.contact_details,
        language: body.language,
        notif_prefs: body.notif_prefs ? JSON.stringify(body.notif_prefs) : undefined,
      });
      res.json({user: updated.user, organisation: updated.organisation});
      return;
    }
    const updatedUser = updateWorkerProfile(auth.userId, {
      full_name: body.full_name,
      address: body.address,
      living_location: body.living_location,
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
      city: body.city,
      photo_url: body.photo_url,
      work_category: body.work_category,
      skills: body.skills,
      experience: body.experience,
      preferred_areas: body.preferred_areas,
      availability: body.availability,
      language: body.language,
      notif_prefs: body.notif_prefs ? JSON.stringify(body.notif_prefs) : undefined,
    });
    res.json({user: updatedUser, organisation: null});
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : 'Failed to update profile.'});
  }
});
