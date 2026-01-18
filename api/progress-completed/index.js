const { getPool, sql } = require('../_shared/db');

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
    const studentId =
      typeof req.query.studentId === 'string' ? normalizeDigits(req.query.studentId).trim() : '';

    if (!studentId) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'studentId is required.' }
      };
      return;
    }

    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .query(
        'SELECT Week, FinalScore, CompletedAt FROM dbo.CardCompletions WHERE StudentId = @studentId ORDER BY CompletedAt DESC'
      );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.recordset
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};
