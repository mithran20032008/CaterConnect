import {config} from '../config.ts';
import {db, nowIso} from '../db.ts';
import {normalizeIndianPhone} from './authRepo.ts';

export interface GroupMemberView {
  id: number;
  group_id: number;
  worker_id: number;
  role: string;
  status: string;
  full_name: string;
  phone: string;
  photo_url: string;
  work_category: string;
  rating_avg: number;
}

export interface GroupView {
  id: number;
  name: string;
  leader_id: number;
  leader_name: string;
  city: string;
  status: string;
  created_at: string;
  members: GroupMemberView[];
  accepted_count: number;
  my_status: string;
}

export function listWorkerGroups(workerId: number): GroupView[] {
  const groups = db
    .prepare(
      `SELECT DISTINCT g.*, u.full_name AS leader_name
       FROM groups g
       JOIN users u ON u.id = g.leader_id
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.worker_id = ? AND g.status = 'active'
       ORDER BY g.created_at DESC`
    )
    .all(workerId) as {
    id: number;
    name: string;
    leader_id: number;
    leader_name: string;
    city: string;
    status: string;
    created_at: string;
  }[];

  return groups.map((g) => {
    const members = db
      .prepare(
        `SELECT gm.id, gm.group_id, gm.worker_id, gm.role, gm.status,
                u.full_name, u.phone, u.photo_url, u.work_category, u.rating_avg
         FROM group_members gm
         JOIN users u ON u.id = gm.worker_id
         WHERE gm.group_id = ?
         ORDER BY CASE WHEN gm.role = 'leader' THEN 0 ELSE 1 END, gm.created_at ASC`
      )
      .all(g.id) as GroupMemberView[];

    const me = members.find((m) => m.worker_id === workerId);
    const acceptedCount = members.filter((m) => m.status === 'accepted').length;
    return {
      ...g,
      members,
      accepted_count: acceptedCount,
      my_status: me?.status || 'invited',
    };
  });
}

export function createGroup(
  leaderId: number,
  name: string,
  city: string
): {ok: true; group: GroupView} | {ok: false; error: string; status: number} {
  if (!name.trim()) {
    return {ok: false, error: 'Group name is required.', status: 400};
  }
  const now = nowIso();
  const groupId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO groups (name, leader_id, city, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(name.trim(), leaderId, city.trim() || 'Coimbatore', now, now);
    const gid = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO group_members (group_id, worker_id, role, status, created_at, updated_at)
       VALUES (?, ?, 'leader', 'accepted', ?, ?)`
    ).run(gid, leaderId, now, now);
    return gid;
  })();

  const all = listWorkerGroups(leaderId);
  return {ok: true, group: all.find((g) => g.id === groupId)!};
}

export function inviteWorkerToGroup(
  groupId: number,
  leaderId: number,
  rawPhone: string
): {ok: true} | {ok: false; error: string; status: number} {
  const group = db
    .prepare('SELECT * FROM groups WHERE id = ? AND status = ?')
    .get(groupId, 'active') as {id: number; name: string; leader_id: number} | undefined;

  if (!group) return {ok: false, error: 'Group not found.', status: 404};
  if (group.leader_id !== leaderId) {
    return {ok: false, error: 'Only the group leader can invite workers.', status: 403};
  }

  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) {
    return {ok: false, error: 'Enter a valid 10-digit mobile number', status: 400};
  }

  const worker = db
    .prepare("SELECT id, full_name, role, status FROM users WHERE phone = ? AND role = 'worker'")
    .get(phone) as {id: number; full_name: string; role: string; status: string} | undefined;

  if (!worker) {
    return {
      ok: false,
      error: 'No registered worker found with this mobile number.',
      status: 404,
    };
  }
  if (worker.id === leaderId) {
    return {ok: false, error: 'You are already the leader of this group.', status: 400};
  }

  const memberCount = (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM group_members WHERE group_id = ? AND status != 'rejected'")
      .get(groupId) as {cnt: number}
  ).cnt;

  if (memberCount >= config.maxGroupSize) {
    return {
      ok: false,
      error: `Maximum group size is ${config.maxGroupSize} members.`,
      status: 400,
    };
  }

  const existing = db
    .prepare('SELECT id, status FROM group_members WHERE group_id = ? AND worker_id = ?')
    .get(groupId, worker.id) as {id: number; status: string} | undefined;

  const now = nowIso();
  if (existing) {
    if (existing.status === 'accepted') {
      return {ok: false, error: 'Worker is already in this group.', status: 409};
    }
    db.prepare(
      `UPDATE group_members SET status = 'invited', updated_at = ? WHERE id = ?`
    ).run(now, existing.id);
  } else {
    db.prepare(
      `INSERT INTO group_members (group_id, worker_id, role, status, created_at, updated_at)
       VALUES (?, ?, 'member', 'invited', ?, ?)`
    ).run(groupId, worker.id, now, now);
  }

  db.prepare(
    `INSERT INTO notifications (user_id, type, title, body, data_json, is_read, status, created_at, updated_at)
     VALUES (?, 'group_invite', 'Group Invitation', ?, ?, 0, 'unread', ?, ?)`
  ).run(
    worker.id,
    `You have been invited to join group "${group.name}".`,
    JSON.stringify({groupId}),
    now,
    now
  );

  return {ok: true};
}

export function respondGroupInvite(
  groupId: number,
  workerId: number,
  accept: boolean
): {ok: true} | {ok: false; error: string; status: number} {
  const row = db
    .prepare('SELECT id, role FROM group_members WHERE group_id = ? AND worker_id = ?')
    .get(groupId, workerId) as {id: number; role: string} | undefined;
  if (!row) return {ok: false, error: 'Group invitation not found.', status: 404};
  if (row.role === 'leader') {
    return {ok: false, error: 'Leader cannot decline their own group.', status: 400};
  }
  const now = nowIso();
  db.prepare(`UPDATE group_members SET status = ?, updated_at = ? WHERE id = ?`).run(
    accept ? 'accepted' : 'rejected',
    now,
    row.id
  );
  return {ok: true};
}

export function removeGroupMember(
  groupId: number,
  leaderId: number,
  targetWorkerId: number
): {ok: true} | {ok: false; error: string; status: number} {
  const group = db
    .prepare('SELECT id, leader_id FROM groups WHERE id = ?')
    .get(groupId) as {id: number; leader_id: number} | undefined;
  if (!group) return {ok: false, error: 'Group not found.', status: 404};
  if (group.leader_id !== leaderId) {
    return {ok: false, error: 'Only the group leader can remove members.', status: 403};
  }
  if (targetWorkerId === leaderId) {
    return {ok: false, error: 'Leader cannot be removed from the group.', status: 400};
  }

  // Prevent removing if group has active bookings/applications under review
  const activeBook = db
    .prepare(
      `SELECT id FROM bookings WHERE group_id = ? AND worker_id = ? AND status IN ('Confirmed', 'Pending admin review', 'Accepted')`
    )
    .get(groupId, targetWorkerId);
  if (activeBook) {
    return {
      ok: false,
      error: 'Cannot remove a member who already has an active group booking.',
      status: 409,
    };
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND worker_id = ?').run(
    groupId,
    targetWorkerId
  );
  return {ok: true};
}
