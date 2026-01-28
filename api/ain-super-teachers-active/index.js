const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

function isSuper(session) {
  return Number(session?.role) === 1;
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
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

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const adminId = toInt(payload.adminId);
  const isActive = toBool(payload.isActive);

  if (!adminId) {
    context.res = badRequest('adminId is required.');
    return;
  }

  if (isActive === null) {
    context.res = badRequest('isActive must be true or false.');
    return;
  }

  try {
    const dbPool = await getPool();
    const updateResult = await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('isActive', sql.Bit, isActive)
      .input('schoolId', sql.Int, session.schoolId)
      .query(
        `UPDATE dbo.AdminAuthUsers
         SET IsActive = @isActive
         WHERE AdminId = @adminId AND SchoolId = @schoolId;
         SELECT AdminId, Username, Role, IsActive
         FROM dbo.AdminAuthUsers
         WHERE AdminId = @adminId AND SchoolId = @schoolId;`
      );

    if (!updateResult.recordset.length) {
      context.res = badRequest('User not found.');
      return;
    }

    context.res = ok({ ok: true, user: updateResult.recordset[0] });
  } catch (error) {
    context.log('Teacher active update failed', error);
    context.res = serverError();
  }
};
