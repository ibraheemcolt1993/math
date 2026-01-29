const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { requireAin, hashPassword } = require('../_shared/ain-auth');

function isSuper(session) {
  return Number(session?.role) === 1;
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('Invalid JSON body.');
      return;
    }

    const adminId = toInt(payload.adminId);
    const password = toCleanString(payload.password);

    if (!adminId) {
      context.res = badRequest('adminId is required.');
      return;
    }

    if (!password || password.length < 6) {
      context.res = badRequest('password must be at least 6 characters.');
      return;
    }

    const dbPool = await getPool();
    const existing = await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, session.schoolId)
      .query(
        `SELECT AdminId
         FROM dbo.AdminAuthUsers
         WHERE AdminId = @adminId AND SchoolId = @schoolId;`
      );

    if (!existing.recordset.length) {
      context.res = badRequest('User not found.');
      return;
    }

    const passwordHash = await hashPassword(password);
    await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .query(
        `UPDATE dbo.AdminAuthUsers
         SET PasswordHash = @passwordHash
         WHERE AdminId = @adminId;`
      );

    await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .query(
        `UPDATE dbo.AdminAuthSessions
         SET RevokedAt = SYSUTCDATETIME()
         WHERE AdminId = @adminId AND RevokedAt IS NULL;`
      );

    context.res = ok({ ok: true });
  } catch (error) {
    context.log('Super teacher password reset failed', error);
    context.res = serverError();
  }
};
