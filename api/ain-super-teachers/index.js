const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { requireAin, hashPassword } = require('../_shared/ain-auth');

function isSuper(session) {
  return Number(session?.role) === 1;
}

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function handleList(context, session) {
  const dbPool = await getPool();
  const result = await dbPool
    .request()
    .input('schoolId', sql.Int, session.schoolId)
    .query(
      `SELECT AdminId, Username, Role, IsActive
       FROM dbo.AdminAuthUsers
       WHERE SchoolId = @schoolId
       ORDER BY AdminId`
    );

  context.res = ok({ ok: true, users: result.recordset });
}

async function handleCreate(context, req, session) {
  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const username = toCleanString(payload.username);
  const password = toCleanString(payload.password);
  const requestedRole = toInt(payload.role);
  const role = requestedRole === 1 || requestedRole === 2 ? requestedRole : 2;

  if (!username) {
    context.res = badRequest('username is required.');
    return;
  }

  if (!password) {
    context.res = badRequest('password is required.');
    return;
  }

  const dbPool = await getPool();
  const existing = await dbPool
    .request()
    .input('username', sql.NVarChar(64), username)
    .query('SELECT AdminId FROM dbo.AdminAuthUsers WHERE Username = @username');

  if (existing.recordset.length) {
    context.res = badRequest('username already exists.');
    return;
  }

  const passwordHash = await hashPassword(password);
  const insertResult = await dbPool
    .request()
    .input('username', sql.NVarChar(64), username)
    .input('passwordHash', sql.NVarChar(200), passwordHash)
    .input('role', sql.TinyInt, role)
    .input('schoolId', sql.Int, session.schoolId)
    .query(
      `INSERT INTO dbo.AdminAuthUsers (Username, PasswordHash, Role, SchoolId)
       VALUES (@username, @passwordHash, @role, @schoolId);
       SELECT AdminId, Username, Role, IsActive
       FROM dbo.AdminAuthUsers
       WHERE Username = @username;`
    );

  context.res = ok({ ok: true, user: insertResult.recordset[0] });
}

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  if (!isSuper(session)) {
    context.res = unauthorized();
    return;
  }

  try {
    if (req.method === 'GET') {
      await handleList(context, session);
      return;
    }

    if (req.method === 'POST') {
      await handleCreate(context, req, session);
      return;
    }

    context.res = badRequest('Unsupported method.');
  } catch (error) {
    context.log('Super teacher endpoint failed', error);
    context.res = serverError();
  }
};
