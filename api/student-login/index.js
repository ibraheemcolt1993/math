const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, response } = require('../_shared/http');

function toLatinDigits(value) {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => map[digit] ?? digit);
}

function deriveFirstName(firstName, fullName) {
  const trimmedFirst = typeof firstName === 'string' ? firstName.trim() : '';
  if (trimmedFirst) {
    return trimmedFirst;
  }

  const trimmedFull = typeof fullName === 'string' ? fullName.trim() : '';
  if (!trimmedFull) {
    return '';
  }

  return trimmedFull.split(/\s+/)[0];
}

module.exports = async function (context, req) {
  try {
    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('Invalid JSON body.');
      return;
    }

    const studentId =
      typeof payload.studentId === 'string' ? toLatinDigits(payload.studentId).trim() : '';
    const birthYear =
      typeof payload.birthYear === 'string' ? toLatinDigits(payload.birthYear).trim() : '';

    if (!studentId || !birthYear) {
      context.res = badRequest('studentId and birthYear are required.');
      return;
    }

    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .input('birthYear', sql.NVarChar(10), birthYear)
      .query(
        `SELECT TOP (1) StudentId, BirthYear, Name, Grade, Class, FirstName
         FROM dbo.Students
         WHERE StudentId = @studentId AND BirthYear = @birthYear`
      );

    if (!result.recordset.length) {
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    const student = result.recordset[0];
    const fullName = typeof student.Name === 'string' ? student.Name.trim() : '';
    const firstName = deriveFirstName(student.FirstName, fullName);

    context.res = ok({
      ok: true,
      student: {
        StudentId: student.StudentId,
        BirthYear: student.BirthYear,
        FirstName: firstName,
        FullName: fullName,
        Class: student.Class
      }
    });
  } catch (error) {
    context.res = response(500, { ok: false, message: 'DB_ERROR' });
  }
};
