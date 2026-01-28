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
  const subject = toCleanString(payload.subject) || null;
  const permLevelInput = toInt(payload.permLevel);
  const permLevel = permLevelInput && permLevelInput > 0 ? permLevelInput : 1;

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
    const studentCheck = await dbPool
      .request()
      .input('studentId', sql.NVarChar(50), studentId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .query('SELECT StudentId FROM dbo.Students WHERE StudentId = @studentId AND SchoolId = @schoolId');

    if (!studentCheck.recordset.length) {
      context.res = badRequest('Student not found.');
      return;
    }

    const adminCheck = await dbPool
      .request()
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .query('SELECT AdminId FROM dbo.AdminAuthUsers WHERE AdminId = @adminId AND SchoolId = @schoolId');

    if (!adminCheck.recordset.length) {
      context.res = badRequest('Teacher not found.');
      return;
    }

    const existing = await dbPool
      .request()
      .input('studentId', sql.NVarChar(50), studentId)
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .query(
        `SELECT SchoolId, StudentId, AdminId, Subject, PermLevel
         FROM dbo.StudentAdmins
         WHERE SchoolId = @schoolId AND StudentId = @studentId AND AdminId = @adminId`
      );

    if (existing.recordset.length) {
      context.res = ok({ ok: true, link: existing.recordset[0] });
      return;
    }

    const insertResult = await dbPool
      .request()
      .input('studentId', sql.NVarChar(50), studentId)
      .input('adminId', sql.Int, adminId)
      .input('schoolId', sql.Int, SCHOOL_ID)
      .input('subject', sql.NVarChar(50), subject)
      .input('permLevel', sql.TinyInt, permLevel)
      .query(
        `INSERT INTO dbo.StudentAdmins (SchoolId, StudentId, AdminId, Subject, PermLevel)
         VALUES (@schoolId, @studentId, @adminId, @subject, @permLevel);
         SELECT SchoolId, StudentId, AdminId, Subject, PermLevel
         FROM dbo.StudentAdmins
         WHERE SchoolId = @schoolId AND StudentId = @studentId AND AdminId = @adminId;`
      );

    context.res = ok({ ok: true, link: insertResult.recordset[0] });
  } catch (error) {
    context.log('Student link create failed', error);
    context.res = serverError();
  }
};
