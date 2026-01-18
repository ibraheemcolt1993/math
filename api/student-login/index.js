const { getPool, sql } = require('../_shared/db');

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

module.exports = async function (context, req) {
  try {
    const payload = parseBody(req);
    if (!payload) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Invalid JSON body.' }
      };
      return;
    }

    const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
    const birthYear = typeof payload.birthYear === 'string' ? payload.birthYear.trim() : '';

    if (!studentId || !birthYear) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'studentId and birthYear are required.' }
      };
      return;
    }

    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .input('birthYear', sql.NVarChar(10), birthYear)
      .query(
        `SELECT StudentId, BirthYear, FirstName, FullName, Class
         FROM Students
         WHERE StudentId = @studentId AND BirthYear = @birthYear`
      );

    if (!result.recordset.length) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Student not found.' }
      };
      return;
    }

    const student = result.recordset[0];

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        studentId: student.StudentId,
        birthYear: student.BirthYear,
        firstName: student.FirstName,
        fullName: student.FullName,
        class: student.Class
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};
