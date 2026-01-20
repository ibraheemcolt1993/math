const { getPool, sql } = require('../db');
const { readJson } = require('../parse');
const { ok, badRequest, methodNotAllowed, response } = require('../http');

function normalizeDigits(value) {
  const map = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9'
  };

  return String(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('');
}

module.exports = async function adminStudentsHandler(context, req) {
  try {
    const dbPool = await getPool();

    if (req.method === 'GET') {
      const result = await dbPool
        .request()
        .query(
          `SELECT StudentId, BirthYear, FirstName, FullName, Class
           FROM dbo.Students
           ORDER BY StudentId`
        );

      context.res = ok({ ok: true, students: result.recordset });
      return;
    }

    if (req.method !== 'PUT') {
      context.res = methodNotAllowed();
      return;
    }

    const payload = readJson(req);
    if (!payload || !Array.isArray(payload.students)) {
      context.res = badRequest('BAD_REQUEST');
      return;
    }

    const normalized = payload.students.map((student) => {
      const studentId = normalizeDigits(String(student.StudentId ?? student.studentId ?? student.id ?? '').trim());
      const birthYear = normalizeDigits(String(student.BirthYear ?? student.birthYear ?? '').trim());
      return {
        StudentId: studentId,
        BirthYear: birthYear,
        FirstName: String(student.FirstName ?? student.firstName ?? '').trim(),
        FullName: String(student.FullName ?? student.fullName ?? '').trim(),
        Class: String(student.Class ?? student.class ?? '').trim()
      };
    });

    const hasInvalid = normalized.some(
      (student) =>
        !student.StudentId ||
        !student.BirthYear ||
        !student.FirstName ||
        !student.FullName ||
        !student.Class
    );

    if (hasInvalid) {
      context.res = badRequest('BAD_REQUEST');
      return;
    }

    const studentIds = normalized.map((student) => student.StudentId);
    const uniqueIds = new Set(studentIds);
    if (uniqueIds.size !== studentIds.length) {
      context.res = badRequest('DUPLICATE_STUDENT_ID');
      return;
    }

    const transaction = new sql.Transaction(dbPool);
    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .query('SELECT StudentId FROM dbo.Students');
      const existingIds = new Set(existing.recordset.map((row) => row.StudentId));
      const incomingIds = new Set(normalized.map((student) => student.StudentId));

      for (const student of normalized) {
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('studentId', sql.NVarChar(20), student.StudentId)
          .input('birthYear', sql.NVarChar(10), student.BirthYear)
          .input('firstName', sql.NVarChar(100), student.FirstName)
          .input('fullName', sql.NVarChar(200), student.FullName)
          .input('class', sql.NVarChar(20), student.Class)
          .query(
            `UPDATE dbo.Students
             SET BirthYear = @birthYear, FirstName = @firstName, FullName = @fullName, Class = @class
             WHERE StudentId = @studentId`
          );

        if (!updateResult.rowsAffected?.[0]) {
          await updateRequest.query(
            `INSERT INTO dbo.Students (StudentId, BirthYear, FirstName, FullName, Class)
             VALUES (@studentId, @birthYear, @firstName, @fullName, @class)`
          );
        }
      }

      const toDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
      for (const studentId of toDelete) {
        await new sql.Request(transaction)
          .input('deleteId', sql.NVarChar(20), studentId)
          .query('DELETE FROM dbo.Students WHERE StudentId = @deleteId');
      }

      await transaction.commit();
    } catch (error) {
      context.log('admin students upsert failed', { message: error.message });
      await transaction.rollback();
      throw error;
    }

    context.res = ok({ ok: true });
  } catch (error) {
    context.log('admin students request failed', { message: error.message });
    context.res = response(500, { ok: false, message: 'DB_ERROR', detail: error.message });
  }
};
