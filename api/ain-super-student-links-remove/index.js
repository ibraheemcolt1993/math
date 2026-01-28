const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

const SCHOOL_ID = 1;

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

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  if (!isSuper(session) || Number(session.schoolId) !== SCHOOL_ID) {
    context.res = unauthorized();
    return;
  }

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const studentId = toCleanString(payload.studentId);
  const adminId = toInt(payload.adminId);

  if (!studentId) {
    context.res = badRequest('studentId is required.');
    return;
  }

  if (!adminId) {
    context.res = badRequest('adminId is required.');
    return;
  }

  try {
    const dbPool = await getPool();
    await dbPool
      .request()
      .input('studentId', sql.NVarChar(50), studentId)
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .query(
        `DELETE FROM dbo.StudentAdmins
         WHERE SchoolId = @schoolId AND StudentId = @studentId AND AdminId = @adminId;`
      );

    context.res = ok({ ok: true });
  } catch (error) {
    context.log('Student link removal failed', error);
    context.res = serverError();
  }
};
