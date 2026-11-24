import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';
import {ensureDefaultAdmin} from '../repositories/userRepo.ts';

function istDatePlusDays(days: number): string {
  // Compute YYYY-MM-DD in Asia/Kolkata (+05:30)
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  return nowIst.toISOString().slice(0, 10);
}

interface DemoSpec {
  key: string;
  phone: string;
  orgName: string;
  category: string;
  workName: string;
  serveType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Night service';
  locationName: string;
  lat: number;
  lng: number;
  dayOffset: number;
  reportingTime: string;
  serviceStart: string;
  serviceEnd: string;
  required: number;
  booked: number;
  dressCode: string;
  basePay: number;
  busFare: number;
  totalPay: number;
  foodProvided: number;
  transportProvided: number;
  instructions: string;
  showContact: number;
  isUrgent: number;
}

const DEMO_SPECS: DemoSpec[] = [
  {
    key: 'demo_1',
    phone: '9000000001',
    orgName: 'Alpha Catering Services',
    category: 'Catering company',
    workName: 'Breakfast Buffet',
    serveType: 'Breakfast',
    locationName: 'RS Puram, Coimbatore',
    lat: 11.0086,
    lng: 76.9516,
    dayOffset: 1,
    reportingTime: '6:00 AM',
    serviceStart: '6:30 AM',
    serviceEnd: '10:30 AM',
    required: 5,
    booked: 2,
    dressCode: 'White shirt, black pant, shoes',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Report cleanly dressed 15 minutes early at the main gate.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_2',
    phone: '9000000002',
    orgName: 'Daily Feast Caterers',
    category: 'Catering company',
    workName: 'Lunch Buffet',
    serveType: 'Lunch',
    locationName: 'Gandhi Park, Coimbatore',
    lat: 10.9992,
    lng: 76.9538,
    dayOffset: 1,
    reportingTime: '11:30 AM',
    serviceStart: '12:00 PM',
    serviceEnd: '3:30 PM',
    required: 5,
    booked: 0,
    dressCode: 'White shirt, black pant',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Apply directly inside CaterConnect. Friendly team environment.',
    showContact: 0,
    isUrgent: 0,
  },
  {
    key: 'demo_3',
    phone: '9000000003',
    orgName: 'Premier Events & Catering',
    category: 'Event organiser',
    workName: 'Dinner Buffet Staff',
    serveType: 'Dinner',
    locationName: 'SMR Mahal, GN Mills, Coimbatore',
    lat: 11.0642,
    lng: 76.9421,
    dayOffset: 2,
    reportingTime: '4:30 PM sharp',
    serviceStart: '6:00 PM',
    serviceEnd: '10:30 PM',
    required: 7,
    booked: 0,
    dressCode: 'Black pant and shoes MUST',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Black pant and formal shoes mandatory. Dinner provided after service.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_4',
    phone: '9000000004',
    orgName: 'Lotus Mahal Catering',
    category: 'Wedding hall',
    workName: 'Dinner Buffet',
    serveType: 'Dinner',
    locationName: 'Lotus Mahal, Mathampatti, Coimbatore',
    lat: 10.9718,
    lng: 76.8902,
    dayOffset: 1,
    reportingTime: '6:00 PM on spot',
    serviceStart: '6:30 PM',
    serviceEnd: '10:30 PM',
    required: 2,
    booked: 1,
    dressCode: 'Neat white shirt, dark pant',
    basePay: 300,
    busFare: 50,
    totalPay: 350,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Arrive on spot at 6:00 PM near the dining hall entrance.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_5',
    phone: '9000000005',
    orgName: 'Urgent Crew Catering',
    category: 'Catering company',
    workName: 'Dinner Night Service',
    serveType: 'Night service',
    locationName: 'Ondipudur, Coimbatore',
    lat: 11.0007,
    lng: 77.0581,
    dayOffset: 1,
    reportingTime: 'As instructed',
    serviceStart: '7:00 PM',
    serviceEnd: '11:30 PM',
    required: 2,
    booked: 2,
    dressCode: 'White shirt, black pant',
    basePay: 400,
    busFare: 0,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 0,
    instructions: 'No back-out, no last-minute cancellation.',
    showContact: 0,
    isUrgent: 1,
  },
  {
    key: 'demo_6',
    phone: '9000000006',
    orgName: 'Sri Annapoorna Caterers',
    category: 'Catering company',
    workName: 'Wedding Lunch Buffet',
    serveType: 'Lunch',
    locationName: 'Peelamedu, Coimbatore',
    lat: 11.0285,
    lng: 77.0029,
    dayOffset: 2,
    reportingTime: '9:00 AM',
    serviceStart: '11:00 AM',
    serviceEnd: '3:30 PM',
    required: 12,
    booked: 4,
    dressCode: 'White shirt, black pant, shoes',
    basePay: 400,
    busFare: 50,
    totalPay: 450,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Large traditional wedding lunch. Groups of 2-6 welcome.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_7',
    phone: '9000000007',
    orgName: 'Kovai Grand Events',
    category: 'Event coordinator',
    workName: 'Reception Dinner',
    serveType: 'Dinner',
    locationName: 'Avinashi Road, Coimbatore',
    lat: 11.0241,
    lng: 76.9882,
    dayOffset: 3,
    reportingTime: '5:00 PM',
    serviceStart: '6:30 PM',
    serviceEnd: '10:30 PM',
    required: 10,
    booked: 9,
    dressCode: 'Black shirt, black pant',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Only 1 spot remaining. All-black formal uniform required.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_8',
    phone: '9000000008',
    orgName: 'Hotel Lakshmi Hall',
    category: 'Wedding hall',
    workName: 'Breakfast Service',
    serveType: 'Breakfast',
    locationName: 'Saibaba Colony, Coimbatore',
    lat: 11.0297,
    lng: 76.9471,
    dayOffset: 2,
    reportingTime: '5:30 AM',
    serviceStart: '6:30 AM',
    serviceEnd: '10:00 AM',
    required: 6,
    booked: 1,
    dressCode: 'White shirt, black pant',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Early morning muhurtham breakfast service.',
    showContact: 0,
    isUrgent: 0,
  },
  {
    key: 'demo_9',
    phone: '9000000009',
    orgName: 'Annam Catering',
    category: 'Catering company',
    workName: 'Lunch Buffet',
    serveType: 'Lunch',
    locationName: 'Singanallur, Coimbatore',
    lat: 10.9964,
    lng: 77.0246,
    dayOffset: 1,
    reportingTime: '10:30 AM',
    serviceStart: '12:00 PM',
    serviceEnd: '3:00 PM',
    required: 8,
    booked: 3,
    dressCode: 'White shirt, black pant, shoes',
    basePay: 350,
    busFare: 50,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Prompt reporting at Singanallur banquet hall.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_10',
    phone: '9000000010',
    orgName: 'Royal Palace Mahal',
    category: 'Wedding hall',
    workName: 'Engagement Dinner',
    serveType: 'Dinner',
    locationName: 'Ukkadam, Coimbatore',
    lat: 10.9896,
    lng: 76.9609,
    dayOffset: 3,
    reportingTime: '5:30 PM',
    serviceStart: '6:45 PM',
    serviceEnd: '10:30 PM',
    required: 15,
    booked: 6,
    dressCode: 'Black pant, white shirt',
    basePay: 400,
    busFare: 50,
    totalPay: 450,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'Large engagement banquet. Groups encouraged to apply.',
    showContact: 1,
    isUrgent: 0,
  },
  {
    key: 'demo_11',
    phone: '9000000011',
    orgName: 'Green Leaf Caterers',
    category: 'Catering company',
    workName: 'Birthday Party Snacks',
    serveType: 'Dinner',
    locationName: 'Race Course, Coimbatore',
    lat: 11.0011,
    lng: 76.9767,
    dayOffset: 2,
    reportingTime: '4:00 PM',
    serviceStart: '5:00 PM',
    serviceEnd: '8:30 PM',
    required: 4,
    booked: 4,
    dressCode: 'Neat casual / white shirt',
    basePay: 300,
    busFare: 50,
    totalPay: 350,
    foodProvided: 1,
    transportProvided: 1,
    instructions: 'All spots filled for this birthday party event.',
    showContact: 0,
    isUrgent: 0,
  },
  {
    key: 'demo_12',
    phone: '9000000012',
    orgName: 'Fast Serve Events',
    category: 'Event organiser',
    workName: 'URGENT Dinner, 2 boys needed',
    serveType: 'Dinner',
    locationName: 'Ganapathy, Coimbatore',
    lat: 11.0366,
    lng: 76.9794,
    dayOffset: 1,
    reportingTime: '6:30 PM',
    serviceStart: '7:00 PM',
    serviceEnd: '10:30 PM',
    required: 2,
    booked: 0,
    dressCode: 'White shirt, black pant',
    basePay: 400,
    busFare: 0,
    totalPay: 400,
    foodProvided: 1,
    transportProvided: 0,
    instructions: 'No back-out, no last-minute cancellation.',
    showContact: 1,
    isUrgent: 1,
  },
];

function ensureDemoWorker(): number {
  const demoWorkerPhone = '9000000099';
  const existing = db
    .prepare('SELECT id FROM users WHERE phone = ?')
    .get(demoWorkerPhone) as {id: number} | undefined;
  if (existing) return existing.id;

  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO users (
        role, phone, full_name, city, living_location, work_category, skills, experience,
        registered_at, verified_at, verified_by, status, created_at, updated_at
      ) VALUES ('worker', ?, 'Demo Crew Member', 'Coimbatore', 'Gandhipuram', 'Buffet Server', 'Table service, Buffet', '2 years', ?, ?, 'demo', 'verified', ?, ?)`
    )
    .run(demoWorkerPhone, now, now, now, now);
  return Number(info.lastInsertRowid);
}

export function seedDatabase(): void {
  ensureDefaultAdmin();

  if (!config.seedDemoJobs) {
    return;
  }

  const now = nowIso();
  const demoWorkerId = ensureDemoWorker();

  const tx = db.transaction(() => {
    for (let idx = 0; idx < DEMO_SPECS.length; idx++) {
      const spec = DEMO_SPECS[idx];
      const eventDate = istDatePlusDays(spec.dayOffset);
      // Stagger created_at slightly so newest-first order is predictable
      const createdAt = new Date(Date.now() - (DEMO_SPECS.length - idx) * 18 * 60 * 1000).toISOString();

      let orgRow = db
        .prepare('SELECT id, user_id FROM organisations WHERE phone = ?')
        .get(spec.phone) as {id: number; user_id: number} | undefined;

      if (!orgRow) {
        let userRow = db
          .prepare('SELECT id FROM users WHERE phone = ?')
          .get(spec.phone) as {id: number} | undefined;

        if (!userRow) {
          const uInfo = db
            .prepare(
              `INSERT INTO users (
                role, phone, full_name, city, registered_at, verified_at, verified_by, rating_avg, rating_count, status, created_at, updated_at
              ) VALUES ('organisation', ?, ?, 'Coimbatore', ?, ?, 'demo', 4.8, 18, 'verified', ?, ?)`
            )
            .run(spec.phone, spec.orgName, now, now, now, now);
          userRow = {id: Number(uInfo.lastInsertRowid)};
        }

        const oInfo = db
          .prepare(
            `INSERT INTO organisations (
              user_id, owner_name, phone, business_name, category, address, city, lat, lng,
              contact_details, is_demo, registered_at, verified_at, verified_by, rating_avg, rating_count, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Coimbatore', ?, ?, ?, 1, ?, ?, 'demo', 4.8, 18, 'verified', ?, ?)`
          )
          .run(
            userRow.id,
            spec.orgName,
            spec.phone,
            spec.orgName,
            spec.category,
            spec.locationName,
            spec.lat,
            spec.lng,
            spec.phone,
            now,
            now,
            now,
            now
          );
        orgRow = {id: Number(oInfo.lastInsertRowid), user_id: userRow.id};
      }

      const existingJob = db
        .prepare('SELECT id FROM jobs WHERE demo_key = ?')
        .get(spec.key) as {id: number} | undefined;

      let jobId: number;
      if (existingJob) {
        jobId = existingJob.id;
        // Refresh relative forward date on every restart without creating duplicates
        db.prepare(
          `UPDATE jobs SET event_date = ?, status = 'open', updated_at = ? WHERE id = ?`
        ).run(eventDate, now, jobId);
      } else {
        const jInfo = db
          .prepare(
            `INSERT INTO jobs (
              organisation_id, work_name, serve_type, event_date, reporting_time,
              service_start, service_end, location_name, city, lat, lng,
              workers_required, dress_code, base_pay, bus_fare, total_pay,
              food_provided, transport_provided, special_instructions,
              show_contact, contact_phone, allow_partial_group, is_urgent,
              is_demo, demo_key, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Coimbatore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 'open', ?, ?)`
          )
          .run(
            orgRow.id,
            spec.workName,
            spec.serveType,
            eventDate,
            spec.reportingTime,
            spec.serviceStart,
            spec.serviceEnd,
            spec.locationName,
            spec.lat,
            spec.lng,
            spec.required,
            spec.dressCode,
            spec.basePay,
            spec.busFare,
            spec.totalPay,
            spec.foodProvided,
            spec.transportProvided,
            spec.instructions,
            spec.showContact,
            spec.showContact ? spec.phone : '',
            spec.isUrgent,
            spec.key,
            createdAt,
            now
          );
        jobId = Number(jInfo.lastInsertRowid);
      }

      // Ensure exact number of demo confirmed bookings for this job
      const currentBooked = (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM bookings WHERE job_id = ? AND is_demo = 1 AND status = 'Confirmed'`
          )
          .get(jobId) as {cnt: number}
      ).cnt;

      if (currentBooked < spec.booked) {
        const toAdd = spec.booked - currentBooked;
        const insertBooking = db.prepare(
          `INSERT INTO bookings (
            job_id, organisation_id, worker_id, agreed_pay, is_demo, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, 'Confirmed', ?, ?)`
        );
        for (let b = 0; b < toAdd; b++) {
          insertBooking.run(jobId, orgRow.id, demoWorkerId, spec.totalPay, now, now);
        }
      }
    }
  });

  tx();
}
