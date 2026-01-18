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
    const dbPool = await getPool();

    if (req.method === 'GET') {
      const result = await dbPool
        .request()
        .query(
          `SELECT StudentId, BirthYear, FirstName, FullName, Class
           FROM Students
           ORDER BY StudentId`
        );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset
      };
      return;
    }

    if (req.method !== 'PUT') {
      context.res = {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Method not allowed.' }
      };
      return;
    }

    const payload = parseBody(req);
    if (!payload || !Array.isArray(payload.students)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'students array is required.' }
      };
      return;
    }

    const normalized = payload.students
      .map((student) => ({
        studentId: String(student.studentId || student.id || '').trim(),
        birthYear: String(student.birthYear || '').trim(),
        firstName: String(student.firstName || '').trim(),
        fullName: String(student.fullName || '').trim(),
        class: String(student.class || '').trim()
      }))
      .filter((student) => student.studentId && student.birthYear);

    const transaction = new sql.Transaction(dbPool);
    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .query('SELECT StudentId FROM Students');
      const existingIds = new Set(existing.recordset.map((row) => row.StudentId));
      const incomingIds = new Set(normalized.map((student) => student.studentId));

      for (const student of normalized) {
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('studentId', sql.NVarChar(20), student.studentId)
          .input('birthYear', sql.NVarChar(10), student.birthYear)
          .input('firstName', sql.NVarChar(100), student.firstName)
          .input('fullName', sql.NVarChar(200), student.fullName)
          .input('class', sql.NVarChar(20), student.class)
          .query(
            `UPDATE Students
             SET BirthYear = @birthYear, FirstName = @firstName, FullName = @fullName, Class = @class
             WHERE StudentId = @studentId`
          );

        if (!updateResult.rowsAffected?.[0]) {
          await updateRequest.query(
            `INSERT INTO Students (StudentId, BirthYear, FirstName, FullName, Class)
             VALUES (@studentId, @birthYear, @firstName, @fullName, @class)`
          );
        }
      }

      const toDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
      for (const studentId of toDelete) {
        await new sql.Request(transaction)
          .input('deleteId', sql.NVarChar(20), studentId)
          .query('DELETE FROM Students WHERE StudentId = @deleteId');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};
