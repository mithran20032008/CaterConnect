import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {config} from '../config.ts';
import {db} from '../db.ts';

export type UserRole = 'worker' | 'organisation' | 'admin';

export interface SessionPayload {
  userId: number;
  role: UserRole;
  phone: string;
  rememberMe?: boolean;
}

export interface AuthedRequest extends Request {
  auth?: SessionPayload;
}

const SESSION_COOKIE = 'cc_session';

function isHttpsRequest(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  return req.secure || req.protocol === 'https';
}

export function signSessionToken(payload: SessionPayload, rememberMe: boolean): string {
  return jwt.sign({...payload, rememberMe}, config.jwtSecret, {
    expiresIn: rememberMe ? '30d' : '1d',
  });
}

export function setSessionCookie(req: Request, res: Response, token: string, rememberMe: boolean): void {
  const maxAge = (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
  const https = isHttpsRequest(req);
  if (https) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      maxAge,
      path: '/',
    });
  } else {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
  }
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? {partitioned: true} : {}),
    path: '/',
  });
}

export function generateCsrfToken(sessionSalt = 'anon'): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${nonce}:${sessionSalt}`)
    .digest('hex');
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  if (!nonce || !sig) return false;
  const expected = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${nonce}:anon`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function csrfAndOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host.split(',')[0].trim()) {
        res.status(403).json({error: 'Cross-origin request blocked'});
        return;
      }
    } catch {
      res.status(403).json({error: 'Invalid origin header'});
      return;
    }
  }
  const headerToken = req.headers['x-csrf-token'];
  const tokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!verifyCsrfToken(tokenStr)) {
    res.status(403).json({error: 'Missing or invalid CSRF token. Please refresh and try again.'});
    return;
  }
  next();
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function extractAuth(req: AuthedRequest): SessionPayload | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  const bearerToken = extractBearerToken(req);
  const candidates = [cookieToken, bearerToken].filter(
    (t): t is string => typeof t === 'string' && t.length > 0
  );

  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as SessionPayload;
      const userRow = db
        .prepare('SELECT id, role, phone, status FROM users WHERE id = ?')
        .get(decoded.userId) as {id: number; role: UserRole; phone: string; status: string} | undefined;
      if (!userRow || userRow.status === 'suspended') {
        continue;
      }
      return {
        userId: userRow.id,
        role: userRow.role,
        phone: userRow.phone,
        rememberMe: Boolean(decoded.rememberMe),
      };
    } catch {
      // try next candidate token (e.g. if stale cookie exists alongside valid Bearer)
    }
  }
  return null;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const payload = extractAuth(req);
  if (payload) {
    req.auth = payload;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const payload = extractAuth(req);
  if (!payload) {
    res.status(401).json({error: 'Please log in to continue.'});
    return;
  }
  req.auth = payload;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({error: 'Please log in to continue.'});
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({error: 'You do not have permission to access this resource.'});
      return;
    }
    next();
  };
}
