const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../_shared/db');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
let columnsCache = null;

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (req.rawBody) {
    try {
      return JSON.parse(req.rawBody);
    } catch (error) {
      return null;
    }
  }

  return null;
}

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

function generateToken(username) {
  const seed = `${username}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
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

async function upgradePassword(dbPool, columns, userId, password) {
  const bcryptHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
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

module.exports = async function (context, req) {
  try {
    const payload = parseBody(req);
    if (!payload) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'INVALID_JSON' }
      };
      return;
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password.trim() : '';

    if (!username || !password) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'MISSING_CREDENTIALS' }
      };
      return;
    }

    const dbPool = await getPool();
    const { columns, user } = await fetchUserByUsername(dbPool, username);

    if (!user) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'INVALID_CREDENTIALS' }
      };
      return;
    }

    if (user.IsActive === false || user.IsActive === 0) {
      context.res = {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'ACCOUNT_DISABLED' }
      };
      return;
    }

    const passwordOk = await verifyPassword(password, user);
    if (!passwordOk) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'INVALID_CREDENTIALS' }
      };
      return;
    }

    const hashType = String(user.PasswordHashType || '').toLowerCase();
    if (hashType !== 'bcrypt' && !user.PasswordHash?.startsWith('$2')) {
      await upgradePassword(dbPool, columns, user.UserId, password);
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: true,
        token: generateToken(username),
        user: { username }
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'DB_ERROR' }
    };
  }
};
