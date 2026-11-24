import Database from 'better-sqlite3';
import {config} from './config.ts';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function nowIso(): string {
  return new Date().toISOString();
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('worker', 'organisation', 'admin')),
      phone TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      living_location TEXT DEFAULT '',
      lat REAL,
      lng REAL,
      city TEXT DEFAULT 'Coimbatore',
      photo_url TEXT DEFAULT '',
      work_category TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      experience TEXT DEFAULT '',
      preferred_areas TEXT DEFAULT '',
      availability TEXT DEFAULT 'Available',
      language TEXT DEFAULT 'en',
      notif_prefs TEXT DEFAULT '{"emergency":true,"bookings":true,"attendance":true,"payments":true,"support":true}',
      registered_at TEXT NOT NULL,
      verified_at TEXT,
      verified_by TEXT DEFAULT '',
      rating_avg REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organisations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      category TEXT NOT NULL,
      address TEXT DEFAULT '',
      city TEXT DEFAULT 'Coimbatore',
      lat REAL,
      lng REAL,
      logo_url TEXT DEFAULT '',
      contact_details TEXT DEFAULT '',
      is_demo INTEGER NOT NULL DEFAULT 0,
      registered_at TEXT NOT NULL,
      verified_at TEXT,
      verified_by TEXT DEFAULT '',
      rating_avg REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, status);

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      work_name TEXT NOT NULL,
      serve_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      reporting_time TEXT NOT NULL,
      service_start TEXT DEFAULT '',
      service_end TEXT DEFAULT '',
      location_name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Coimbatore',
      lat REAL,
      lng REAL,
      workers_required INTEGER NOT NULL,
      dress_code TEXT DEFAULT '',
      base_pay INTEGER NOT NULL DEFAULT 0,
      bus_fare INTEGER NOT NULL DEFAULT 0,
      total_pay INTEGER NOT NULL DEFAULT 0,
      food_provided INTEGER NOT NULL DEFAULT 1,
      transport_provided INTEGER NOT NULL DEFAULT 0,
      special_instructions TEXT DEFAULT '',
      show_contact INTEGER NOT NULL DEFAULT 0,
      contact_phone TEXT DEFAULT '',
      allow_partial_group INTEGER NOT NULL DEFAULT 1,
      is_urgent INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      demo_key TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status_date ON jobs(status, event_date);

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      leader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      city TEXT DEFAULT 'Coimbatore',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'invited',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(group_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      worker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      applicant_type TEXT NOT NULL CHECK (applicant_type IN ('individual', 'group')),
      note TEXT DEFAULT '',
      is_demo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Applied',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id, status);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      agreed_pay INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending admin review',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_job ON bookings(job_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_worker ON bookings(worker_id, status);

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reminder_sent_at TEXT,
      responded_at TEXT,
      arrived_at TEXT,
      arrival_lat REAL,
      arrival_lng REAL,
      arrival_distance_m REAL,
      arrival_verified INTEGER NOT NULL DEFAULT 0,
      flagged INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replacements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      vacancies_needed INTEGER NOT NULL DEFAULT 1,
      filled_count INTEGER NOT NULL DEFAULT 0,
      triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replacement_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      replacement_id INTEGER NOT NULL REFERENCES replacements(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      distance_km REAL DEFAULT 0,
      score REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(replacement_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data_json TEXT DEFAULT '{}',
      is_read INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_role TEXT NOT NULL,
      punctuality INTEGER NOT NULL DEFAULT 5,
      behaviour INTEGER NOT NULL DEFAULT 5,
      work_quality INTEGER NOT NULL DEFAULT 5,
      communication INTEGER NOT NULL DEFAULT 5,
      payment_reliability INTEGER NOT NULL DEFAULT 5,
      overall REAL NOT NULL DEFAULT 5,
      comment TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(booking_id, reviewer_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      attachment_url TEXT DEFAULT '',
      admin_response TEXT DEFAULT '',
      responded_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      offered_amount INTEGER NOT NULL DEFAULT 0,
      agreed_amount INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash / Direct UPI',
      paid_at TEXT,
      worker_confirmed_at TEXT,
      dispute_reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unpaid',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'saved',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const appCols = db.prepare('PRAGMA table_info(applications)').all() as {name: string}[];
  if (!appCols.some((c) => c.name === 'is_demo')) {
    db.exec('ALTER TABLE applications ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
  }
}
