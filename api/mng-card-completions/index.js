const { getPool, sql } = require('../_shared/db');
const { getQuery } = require('../_shared/parse');
const { ok, badRequest, notFound, response } = require('../_shared/http');

function normalizeDigits(value) {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => map[digit] ?? digit);
}

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = async function (context, req) {
  try {
    const weekParam = Number(req.params.week);
    if (!Number.isInteger(weekParam)) {
      context.res = badRequest('week must be a valid integer.');
      return;
    }

    const query = getQuery(req);
    const classInput = toCleanString(query.class);
    const className = normalizeDigits(classInput);
    const hasClassFilter = className && className !== 'ALL_CLASSES';

    const dbPool = await getPool();
    const weekCheck = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT Week FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0');

    if (!weekCheck.recordset.length) {
      context.res = notFound('Card not found.');
      return;
    }

    const request = dbPool.request();
    request.input('week', sql.Int, weekParam);

    let sqlQuery = `
      SELECT c.StudentId,
             s.Name AS FullName,
             s.Class,
             c.FinalScore,
             c.CompletedAt
      FROM dbo.CardCompletions c
      JOIN dbo.Students s ON s.StudentId = c.StudentId
      WHERE c.Week = @week
    `;

    if (hasClassFilter) {
      request.input('className', sql.NVarChar(50), className);
      sqlQuery += ' AND s.Class = @className';
    }

    sqlQuery += ' ORDER BY c.CompletedAt DESC, s.Name, s.StudentId';

    const result = await request.query(sqlQuery);

    context.res = ok({ ok: true, students: result.recordset });
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
