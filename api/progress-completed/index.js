const { getPool, sql } = require('../_shared/db');
const { getQuery } = require('../_shared/parse');
const { ok, badRequest, response } = require('../_shared/http');

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

module.exports = async function (context, req) {
  try {
    const query = getQuery(req);
    const studentId =
      typeof query.studentId === 'string' ? normalizeDigits(query.studentId).trim() : '';

    if (!studentId) {
      context.res = badRequest('studentId is required.');
      return;
    }

    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .query(
        'SELECT Week, FinalScore, CompletedAt FROM dbo.CardCompletions WHERE StudentId = @studentId ORDER BY CompletedAt DESC'
      );

    context.res = ok(result.recordset);
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
