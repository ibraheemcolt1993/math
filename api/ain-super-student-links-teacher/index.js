const { getPool, sql } = require('../_shared/db');
const { getQuery } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

const SCHOOL_ID = 1;

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

  if (!isSuper(session) || Number(session.schoolId) !== SCHOOL_ID) {
    context.res = unauthorized();
    return;
  }

  const query = getQuery(req);
  const adminId = toInt(query.adminId);

  if (!adminId) {
    context.res = badRequest('adminId is required.');
    return;
  }

  try {
    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .query(
        `SELECT SchoolId, StudentId, AdminId, Subject, PermLevel
         FROM dbo.StudentAdmins
         WHERE SchoolId = @schoolId AND AdminId = @adminId
         ORDER BY StudentId`
      );

    context.res = ok({ ok: true, links: result.recordset });
  } catch (error) {
    context.log('Student link list (teacher) failed', error);
    context.res = serverError();
  }
};
