import cron from 'node-cron';
import {runAutoVerifySweep} from '../repositories/userRepo.ts';

let started = false;
let verifyTimer: ReturnType<typeof setInterval> | null = null;
let attendanceHook: (() => void) | null = null;

export function registerAttendanceReminderHook(fn: () => void): void {
  attendanceHook = fn;
}

export function startSchedulers(): void {
  if (started) return;
  started = true;

  // Immediate sweep on boot so restarts never leave accounts stuck
  runAutoVerifySweep();

  // Every 15 seconds: auto-verify pending accounts older than AUTO_VERIFY_MINUTES
  verifyTimer = setInterval(() => {
    try {
      runAutoVerifySweep();
    } catch (err) {
      console.error('Auto-verify sweep error:', err);
    }
  }, 15_000);

  // Every minute: 1-hour attendance confirmation reminder sweep (Asia/Kolkata aware)
  cron.schedule('* * * * *', () => {
    try {
      if (attendanceHook) {
        attendanceHook();
      }
    } catch (err) {
      console.error('Attendance reminder cron error:', err);
    }
  });
}

export function stopSchedulers(): void {
  if (verifyTimer) {
    clearInterval(verifyTimer);
    verifyTimer = null;
  }
  started = false;
}
