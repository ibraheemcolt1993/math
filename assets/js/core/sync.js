/* =========================================================
   sync.js — Optional Google Sheets Sync (via Google Apps Script Web App)
   - Offline-first: LocalStorage remains source of truth
   - When enabled, sends key events to a GAS endpoint:
     * completion
     * certificate
   - Queue in LocalStorage + best-effort flush

   UPDATE (2026-01-14):
   - Fix CORS: Google Apps Script /exec blocks fetch due to CORS preflight.
     We now send events using:
       1) navigator.sendBeacon (preferred)
       2) fetch with mode:'no-cors' as fallback
     This guarantees the request is SENT even without CORS headers.
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

function buildEndpointUrl() {
  const base = String(SYNC.ENDPOINT || '').trim();
  if (!base) return '';

  // If SECRET is set, pass it as query param (no custom headers => no preflight)
  if (SYNC.SECRET) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}secret=${encodeURIComponent(SYNC.SECRET)}`;
  }
  return base;
}

/**
 * Enqueue an event and try to flush (best-effort).
 */
export function enqueueSyncEvent({ type, studentId, week, payload }) {
  if (!isSyncEnabled()) return;

  const endpoint = buildEndpointUrl();
  if (!endpoint || endpoint.includes('PASTE_YOUR_SCRIPT_URL_HERE')) return;

  const ev = makeEvent({ type, studentId, week, payload });

  const q = readQueue();
  q.push(ev);
  writeQueue(q);

  flushSyncQueue(); // best-effort
}

/**
 * Flush queue (best-effort). Removes events that were SENT.
 * Note: With no-cors / beacon we can't read response, but request is delivered.
 */
export async function flushSyncQueue() {
  if (!isSyncEnabled()) return;

  const endpoint = buildEndpointUrl();
  if (!endpoint || endpoint.includes('PASTE_YOUR_SCRIPT_URL_HERE')) return;

  const q = readQueue();
  if (!q.length) return;

  const remaining = [];

  for (const ev of q) {
    const sent = await sendEventNoCors(endpoint, ev);
    if (!sent) remaining.push(ev);
  }

  writeQueue(remaining);
}

/**
 * Send cross-origin without CORS issues:
 * - Prefer navigator.sendBeacon (no preflight, no CORS blocking)
 * - Fallback: fetch with mode:'no-cors' (opaque response, but request is sent)
 */
async function sendEventNoCors(endpoint, ev) {
  const json = JSON.stringify(ev);

  // 1) Beacon (best)
  try {
    if (navigator.sendBeacon) {
      // Use text/plain to stay "simple"
      const blob = new Blob([json], { type: 'text/plain;charset=utf-8' });
      const ok = navigator.sendBeacon(endpoint, blob);
      return Boolean(ok);
    }
  } catch {
    // ignore and fallback
  }

  // 2) fetch no-cors fallback
  try {
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      // text/plain is allowed in no-cors and avoids preflight
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: json,
      keepalive: true,
    });
    // If no exception, we consider it sent.
    return true;
  } catch {
    return false;
  }
}
