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
  const role = toInt(payload.role);

  if (!adminId) {
    context.res = badRequest('adminId is required.');
    return;
  }

  if (role !== 1 && role !== 2) {
    context.res = badRequest('role must be 1 or 2.');
    return;
  }

  try {
    const dbPool = await getPool();
    const updateResult = await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('role', sql.TinyInt, role)
      .input('schoolId', sql.Int, session.schoolId)
      .query(
        `UPDATE dbo.AdminAuthUsers
         SET Role = @role
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
    context.log('Teacher role update failed', error);
    context.res = serverError();
  }
};
