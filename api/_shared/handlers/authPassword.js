const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { readJson } = require('../parse');
const { ok, badRequest, unauthorized, notFound, response } = require('../http');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const AUTH_DEBUG = process.env.AUTH_DEBUG === 'true';
let columnsCache = null;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(left, right) {
  const leftBuf = Buffer.from(String(left || ''), 'hex');
  const rightBuf = Buffer.from(String(right || ''), 'hex');
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function buildAuthDebug({ username, password, storedHash, salt, hashType }) {
  if (!AUTH_DEBUG) return null;
  const rawUsername = String(username ?? '');
  const rawPassword = String(password ?? '');
  const rawHash = String(storedHash ?? '');
  const rawSalt = String(salt ?? '');
  return {
    usernameLength: rawUsername.length,
    passwordLength: rawPassword.length,
    passwordHasLeadingSpace: rawPassword.startsWith(' '),
    passwordHasTrailingSpace: rawPassword.endsWith(' '),
    storedHashLength: rawHash.length,
    storedHashStartsWithBcrypt: rawHash.startsWith('$2'),
    hasSalt: Boolean(rawSalt),
    hashType
  };
}

async function loadColumns(dbPool) {
  if (columnsCache) return columnsCache;
  const result = await dbPool
    .request()
    .query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'AdminUsers'`
    );
  const columns = new Set(result.recordset.map((row) => row.COLUMN_NAME));
  const idColumn = columns.has('AdminId')
    ? 'AdminId'
    : columns.has('AdminUserId')
    ? 'AdminUserId'
    : 'AdminId';
  columnsCache = {
    idColumn,
    hasSalt: columns.has('PasswordSalt'),
    hasHashType: columns.has('PasswordHashType')
  };
  return columnsCache;
}

async function fetchUserByUsername(dbPool, username) {
  const columns = await loadColumns(dbPool);
  const selectSalt = columns.hasSalt
    ? 'PasswordSalt'
    : 'CAST(NULL AS NVARCHAR(64)) AS PasswordSalt';
  const selectHashType = columns.hasHashType
    ? 'PasswordHashType'
    : 'CAST(NULL AS NVARCHAR(20)) AS PasswordHashType';
  const result = await dbPool
    .request()
    .input('username', sql.NVarChar(80), username)
    .query(
      `SELECT ${columns.idColumn} AS UserId,
              Username,
              PasswordHash,
              ${selectSalt},
              ${selectHashType},
              IsActive
       FROM dbo.AdminUsers
       WHERE Username = @username`
    );
  return { columns, user: result.recordset[0] };
}

async function verifyPassword(password, user) {
  const hashType = String(user.PasswordHashType || '').toLowerCase();
  const storedHash = String(user.PasswordHash || '').trim();
  if (hashType === 'bcrypt' && storedHash) {
    return bcrypt.compare(password, storedHash);
  }

  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }

  const salt = String(user.PasswordSalt || '').trim();
  if (salt) {
    const legacyHash = sha256Hex(`${salt}:${password}`);
    if (safeEqualHex(legacyHash, storedHash)) {
      return true;
    }
    const alternateHash = sha256Hex(`${salt}${password}`);
    return safeEqualHex(alternateHash, storedHash);
  }

  if (storedHash.length === 64) {
    return safeEqualHex(sha256Hex(password), storedHash);
  }

  return storedHash === password;
}

async function updatePassword(dbPool, columns, userId, newPassword) {
  const bcryptHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const request = dbPool
    .request()
    .input('userId', sql.Int, userId)
    .input('passwordHash', sql.NVarChar(255), bcryptHash);
  const setClauses = ['PasswordHash = @passwordHash', 'UpdatedAt = SYSUTCDATETIME()'];

  if (columns.hasSalt) {
    request.input('passwordSalt', sql.NVarChar(64), null);
    setClauses.push('PasswordSalt = @passwordSalt');
  }

  if (columns.hasHashType) {
    request.input('passwordHashType', sql.NVarChar(20), 'bcrypt');
    setClauses.push('PasswordHashType = @passwordHashType');
  }

  await request.query(
    `UPDATE dbo.AdminUsers
     SET ${setClauses.join(', ')}
     WHERE ${columns.idColumn} = @userId`
  );
}

module.exports = async function authPasswordHandler(context, req) {
  try {
    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('INVALID_JSON');
      return;
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const currentPassword =
      typeof payload.currentPassword === 'string' ? payload.currentPassword.trim() : '';
    const newPassword =
      typeof payload.newPassword === 'string' ? payload.newPassword.trim() : '';

    if (!username || !currentPassword || !newPassword) {
      context.res = badRequest('MISSING_FIELDS');
      return;
    }

    const dbPool = await getPool();
    const { columns, user } = await fetchUserByUsername(dbPool, username);

    if (!user) {
      context.res = notFound('NOT_FOUND');
      return;
    }

    if (user.IsActive === false || user.IsActive === 0) {
      context.res = response(403, { ok: false, error: 'ACCOUNT_DISABLED' });
      return;
    }

    const passwordOk = await verifyPassword(currentPassword, user);
    if (!passwordOk) {
      const debug = buildAuthDebug({
        username,
        password: currentPassword,
        storedHash: user.PasswordHash,
        salt: user.PasswordSalt,
        hashType: user.PasswordHashType
      });
      context.res = debug
        ? response(401, { ok: false, error: 'INVALID_CREDENTIALS', debug })
        : unauthorized('INVALID_CREDENTIALS');
      return;
    }

    await updatePassword(dbPool, columns, user.UserId, newPassword);

    context.res = ok({ ok: true });
  } catch (error) {
    context.res = response(500, { ok: false, error: 'DB_ERROR' });
  }
};
