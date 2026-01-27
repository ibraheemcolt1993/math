const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('./db');
const { unauthorized } = require('./http');

const DEFAULT_SESSION_HOURS = 8;
const DEFAULT_COOKIE_NAME = 'ain_sess';

function getSessionConfig() {
  const rawHours = Number.parseFloat(process.env.AIN_SESSION_HOURS);
  const sessionHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : DEFAULT_SESSION_HOURS;
  const cookieName = process.env.AIN_SESSION_COOKIE || DEFAULT_COOKIE_NAME;
  return { sessionHours, cookieName };
}

function parseCookies(headerValue) {
  if (!headerValue) return {};
  return headerValue.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function getCookie(req, name) {
  const header = req?.headers?.cookie || req?.headers?.Cookie || '';
  const cookies = parseCookies(header);
  return cookies[name] || '';
}

function buildSessionCookie(name, token, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/'
  ];

  if (Number.isFinite(maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  }

  return parts.join('; ');
}

function buildClearCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createSession(adminId) {
  const { sessionHours } = getSessionConfig();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  const token = generateToken();
  const tokenHash = hashToken(token);

  const dbPool = await getPool();
  await dbPool
    .request()
    .input('adminId', sql.Int, adminId)
    .input('tokenHash', sql.VarBinary(32), tokenHash)
    .input('expiresAt', sql.DateTime, expiresAt)
    .query(
      `INSERT INTO dbo.AdminAuthSessions (AdminId, TokenHash, ExpiresAt)
       VALUES (@adminId, @tokenHash, @expiresAt);`
    );

  return { token, expiresAt };
}

async function requireAin(context, req) {
  const { cookieName } = getSessionConfig();
  const token = getCookie(req, cookieName);
  if (!token) {
    context.res = unauthorized();
    return null;
  }

  try {
    const dbPool = await getPool();
    const tokenHash = hashToken(token);
    const result = await dbPool
      .request()
      .input('tokenHash', sql.VarBinary(32), tokenHash)
      .query(
        `SELECT TOP (1)
           s.SessionId,
           s.AdminId,
           s.ExpiresAt,
           s.RevokedAt,
           u.Username,
           u.IsActive
         FROM dbo.AdminAuthSessions s
         JOIN dbo.AdminAuthUsers u ON u.AdminId = s.AdminId
         WHERE s.TokenHash = @tokenHash`
      );

    if (!result.recordset.length) {
      context.res = unauthorized();
      return null;
    }

    const session = result.recordset[0];
    const expired = session.ExpiresAt && new Date(session.ExpiresAt) <= new Date();
    const revoked = session.RevokedAt != null;
    const inactive = session.IsActive === false || session.IsActive === 0;

    if (expired || revoked || inactive) {
      context.res = unauthorized();
      return null;
    }

    return {
      sessionId: session.SessionId,
      adminId: session.AdminId,
      username: session.Username
    };
  } catch (error) {
    context.log('AIN session check failed', error);
    context.res = unauthorized();
    return null;
  }
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

module.exports = {
  getSessionConfig,
  getCookie,
  buildSessionCookie,
  buildClearCookie,
  createSession,
  requireAin,
  verifyPassword,
  hashPassword,
  hashToken
};
