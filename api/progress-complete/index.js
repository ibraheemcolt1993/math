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

    const studentId =
      typeof payload.studentId === 'string'
        ? normalizeDigits(payload.studentId).trim()
        : '';
    const week = Number(payload.week);
    const finalScore = Number(payload.finalScore);

    if (!studentId) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'studentId is required.' }
      };
      return;
    }

    if (!Number.isInteger(week)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'week must be an integer.' }
      };
      return;
    }

    if (!Number.isInteger(finalScore) || finalScore < 0 || finalScore > 100) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'finalScore must be an integer between 0 and 100.' }
      };
      return;
    }

    const dbPool = await getPool();

    const studentResult = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .query('SELECT StudentId FROM dbo.Students WHERE StudentId = @studentId');

    if (!studentResult.recordset.length) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Student not found.' }
      };
      return;
    }

    const weekResult = await dbPool
      .request()
      .input('week', sql.Int, week)
      .query('SELECT Week FROM dbo.Weeks WHERE Week = @week');

    if (!weekResult.recordset.length) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Week not found.' }
      };
      return;
    }

    const completionResult = await dbPool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .input('week', sql.Int, week)
      .input('finalScore', sql.Int, finalScore)
      .query(
        `IF EXISTS (SELECT 1 FROM dbo.CardCompletions WHERE StudentId = @studentId AND Week = @week)
         BEGIN
           UPDATE dbo.CardCompletions
           SET FinalScore = @finalScore,
               CompletedAt = GETDATE()
           WHERE StudentId = @studentId AND Week = @week;
         END
         ELSE
         BEGIN
           INSERT INTO dbo.CardCompletions (StudentId, Week, FinalScore)
           VALUES (@studentId, @week, @finalScore);
         END

         SELECT StudentId, Week, FinalScore, CompletedAt
         FROM dbo.CardCompletions
         WHERE StudentId = @studentId AND Week = @week;`
      );

    const record = completionResult.recordset[0];

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: true,
        studentId: record.StudentId,
        week: record.Week,
        finalScore: record.FinalScore,
        completedAt: record.CompletedAt
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
