const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { readJson } = require('../parse');
const { ok, badRequest, unauthorized, notFound, response } = require('../http');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
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
  if (hashType === 'bcrypt' && user.PasswordHash) {
    return bcrypt.compare(password, user.PasswordHash);
  }

  if (!user.PasswordHash) {
    return false;
  }

  if (user.PasswordSalt) {
    const legacyHash = sha256Hex(`${user.PasswordSalt}:${password}`);
    return safeEqualHex(legacyHash, user.PasswordHash);
  }

  if (user.PasswordHash.startsWith('$2')) {
    return bcrypt.compare(password, user.PasswordHash);
  }

  if (user.PasswordHash.length === 64) {
    return safeEqualHex(sha256Hex(password), user.PasswordHash);
  }

  return user.PasswordHash === password;
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
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    await updatePassword(dbPool, columns, user.UserId, newPassword);

    context.res = ok({ ok: true });
  } catch (error) {
    context.res = response(500, { ok: false, error: 'DB_ERROR' });
  }
};
