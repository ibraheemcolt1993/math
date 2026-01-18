const { getPool, sql } = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';

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
        'SELECT Week, FinalScore, CompletedAt FROM CardCompletions WHERE StudentId = @studentId ORDER BY CompletedAt DESC'
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
