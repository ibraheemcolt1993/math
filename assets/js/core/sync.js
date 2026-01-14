/* =========================================================
   sync.js — Optional Google Sheets Sync (via Google Apps Script Web App)
   - Keeps the app fully offline-first (LocalStorage remains source of truth)
   - When enabled, sends key events to a GAS endpoint:
     * completion
     * certificate (payload stored by completion.js)
   - Safe: if network fails, we keep a queue in LocalStorage and retry later
   ========================================================= */

import { SYNC, STORAGE_KEYS } from './constants.js';

const LS_SYNC_QUEUE = STORAGE_KEYS.SYNC_QUEUE;       // array of events
const LS_SYNC_ENABLED = STORAGE_KEYS.SYNC_ENABLED;   // '1' | '0'

function readQueue() {
  try {
    const raw = localStorage.getItem(LS_SYNC_QUEUE);
    const q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(LS_SYNC_QUEUE, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function isSyncEnabled() {
  try {
    return localStorage.getItem(LS_SYNC_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function setSyncEnabled(enabled) {
  try {
    localStorage.setItem(LS_SYNC_ENABLED, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeEvent({ type, studentId, week, payload }) {
  return {
    id: `${type}:${studentId}:${week}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    type,
    studentId: String(studentId ?? ''),
    week: Number(week),
    payload: payload ?? {},
    createdAt: nowIso(),
  };
}

/**
 * Enqueue an event and try to flush in background.
 * This is safe even if offline (will retry later).
 */
export function enqueueSyncEvent({ type, studentId, week, payload }) {
  if (!isSyncEnabled()) return;

  // Guard: require endpoint
  if (!SYNC.ENDPOINT || SYNC.ENDPOINT.includes('PASTE_YOUR_SCRIPT_URL_HERE')) return;

  const ev = makeEvent({ type, studentId, week, payload });

  const q = readQueue();
  q.push(ev);
  writeQueue(q);

  // try to flush (best-effort)
  flushSyncQueue();
}

/**
 * Flush queue (best effort). Keeps remaining events if fails.
 */
export async function flushSyncQueue() {
  if (!isSyncEnabled()) return;

  if (!SYNC.ENDPOINT || SYNC.ENDPOINT.includes('PASTE_YOUR_SCRIPT_URL_HERE')) return;

  const q = readQueue();
  if (!q.length) return;

  // Send one by one to keep it simple & reliable
  const remaining = [];

  for (const ev of q) {
    const ok = await sendEvent(ev);
    if (!ok) remaining.push(ev);
  }

  writeQueue(remaining);
}

async function sendEvent(ev) {
  try {
    const res = await fetch(SYNC.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // optional shared secret (recommended)
        ...(SYNC.SECRET ? { 'X-MATH-SECRET': SYNC.SECRET } : {}),
      },
      body: JSON.stringify(ev),
      // keepalive helps when user navigates away (supported in modern browsers)
      keepalive: true,
    });

    if (!res.ok) return false;

    // We don't need the body, but keep it safe
    return true;
  } catch {
    return false;
  }
}
