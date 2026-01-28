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

function buildSetCookie(token, maxAgeSeconds) {
  const { cookieName } = getSessionConfig();
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
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

function buildClearCookie() {
  const { cookieName } = getSessionConfig();
  return `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createSession(adminId, hours) {
  const { sessionHours } = getSessionConfig();
  const effectiveHours = Number.isFinite(hours) && hours > 0 ? hours : sessionHours;
  const expiresAt = new Date(Date.now() + effectiveHours * 60 * 60 * 1000);
  const token = generateToken();
  const tokenHash = hashToken(token);

  const dbPool = await getPool();
  await dbPool
    .request()
    .input('adminId', sql.Int, adminId)
    .input('tokenHash', sql.Char(64), tokenHash)
    .input('expiresAt', sql.DateTime2, expiresAt)
    .query(
      `INSERT INTO dbo.AdminAuthSessions (AdminId, TokenHash, ExpiresAt)
       VALUES (@adminId, @tokenHash, @expiresAt);`
    );

  return { token, expiresAt };
}

async function requireAin(req, context) {
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
      .input('tokenHash', sql.Char(64), tokenHash)
      .query(
        `SELECT TOP (1)
           s.SessionId,
           s.AdminId,
         u.Username,
         u.Role,
         u.SchoolId,
         u.IsActive
         FROM dbo.AdminAuthSessions s
         JOIN dbo.AdminAuthUsers u ON u.AdminId = s.AdminId
         WHERE s.TokenHash = @tokenHash
           AND s.RevokedAt IS NULL
           AND s.ExpiresAt > SYSUTCDATETIME()`
      );

    if (!result.recordset.length) {
      context.res = unauthorized();
      return null;
    }

    const session = result.recordset[0];
    const inactive = session.IsActive === false || session.IsActive === 0;

    if (inactive) {
      context.res = unauthorized();
      return null;
    }

    return {
      adminId: session.AdminId,
      username: session.Username,
      role: session.Role,
      schoolId: session.SchoolId,
      tokenHash
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
  buildSetCookie,
  buildClearCookie,
  createSession,
  requireAin,
  verifyPassword,
  hashPassword,
  hashToken
};
