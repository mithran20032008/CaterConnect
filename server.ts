import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import {createServer as createViteServer} from 'vite';
import {config} from './server/config.ts';
import {initSchema} from './server/db.ts';
import {
  csrfAndOriginGuard,
  generateCsrfToken,
  optionalAuth,
  signSessionToken,
  type AuthedRequest,
} from './server/middleware/auth.ts';
import {processOneHourAttendanceReminders} from './server/repositories/attendanceRepo.ts';
import {autoVerifyIfDue, findOrgByUserId, findUserById} from './server/repositories/userRepo.ts';
import {attendanceAdminRouter} from './server/routes/attendanceAdminRoutes.ts';
import {authRouter} from './server/routes/authRoutes.ts';
import {groupBookingRouter} from './server/routes/groupBookingRoutes.ts';
import {jobRouter} from './server/routes/jobRoutes.ts';
import {registerAttendanceReminderHook, startSchedulers} from './server/services/scheduler.ts';
import {seedDatabase} from './server/services/seed.ts';

async function startServer() {
  initSchema();
  seedDatabase();
  registerAttendanceReminderHook(processOneHourAttendanceReminders);
  startSchedulers();

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );
  app.use(cookieParser());
  app.use(express.json({limit: '4mb'}));
  app.use(express.urlencoded({extended: true, limit: '4mb'}));

  // Serve uploaded files safely from ./uploads
  app.use('/uploads', express.static(config.uploadsDir, {dotfiles: 'deny', index: false}));

  // Public health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      brandColor: config.brandColor,
      autoVerifyMinutes: config.autoVerifyMinutes,
      maxGroupSize: config.maxGroupSize,
      geofenceRadiusMeters: config.geofenceRadiusMeters,
      seedDemoJobs: config.seedDemoJobs,
    });
  });

  // CSRF token endpoint
  app.get('/api/auth/csrf', (_req, res) => {
    res.json({csrfToken: generateCsrfToken('anon')});
  });

  // CSRF + Origin guard for all /api mutations
  app.use('/api', csrfAndOriginGuard);

  // Current user session endpoint
  app.get('/api/auth/me', optionalAuth, (req: AuthedRequest, res) => {
    if (!req.auth) {
      res.json({user: null, organisation: null});
      return;
    }
    autoVerifyIfDue(req.auth.userId);
    const user = findUserById(req.auth.userId);
    if (!user) {
      res.json({user: null, organisation: null});
      return;
    }
    const organisation = user.role === 'organisation' ? findOrgByUserId(user.id) || null : null;
    const token = signSessionToken(
      {userId: user.id, role: user.role, phone: user.phone},
      req.auth.rememberMe !== false
    );
    res.json({
      user,
      organisation,
      autoVerifyMinutes: config.autoVerifyMinutes,
      token,
    });
  });

  app.use('/api', authRouter);
  app.use('/api', jobRouter);
  app.use('/api', groupBookingRouter);
  app.use('/api', attendanceAdminRouter);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(config.rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/@vite/client', (req, res, next) => {
      delete req.headers['if-none-match'];
      delete req.headers['if-modified-since'];
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);
      const origSetHeader = res.setHeader.bind(res);
      const chunks: Buffer[] = [];

      res.setHeader = ((name: string, value: number | string | readonly string[]) => {
        if (name.toLowerCase() === 'content-length') return res;
        return origSetHeader(name, value);
      }) as typeof res.setHeader;

      res.write = ((chunk: unknown) => {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        return true;
      }) as typeof res.write;

      res.end = ((chunk?: unknown) => {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        const raw = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          res.write = origWrite;
          res.end = origEnd;
          return origEnd(raw);
        }
        const body = raw
          .toString('utf8')
          .replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled: WebSocket connection skipped */'
          );
        origSetHeader('Content-Length', Buffer.byteLength(body));
        return origEnd(body);
      }) as typeof res.end;

      next();
    });

    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false, ws: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`CaterConnect server running on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CaterConnect server:', err);
  process.exit(1);
});
