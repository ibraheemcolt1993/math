const { getPool, sql } = require('../_shared/db');
const { getQuery } = require('../_shared/parse');
const { ok, badRequest, response } = require('../_shared/http');

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
    const query = getQuery(req);
    const grade = normalizeDigits(toCleanString(query.grade));
    const classInput = toCleanString(query.class);
    const className = normalizeDigits(classInput);

    if (!grade) {
      context.res = badRequest('grade is required.');
      return;
    }

    const dbPool = await getPool();
    const request = dbPool.request();
    request.input('grade', sql.NVarChar(50), grade);

    const conditions = ['w.IsDeleted = 0', 'w.Grade = @grade'];
    const hasClassFilter = className && className !== 'ALL_CLASSES';

    if (hasClassFilter) {
      request.input('className', sql.NVarChar(50), className);
      conditions.push(`(
        NOT EXISTS (SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week)
        OR EXISTS (
          SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week AND wt.Class = @className
        )
      )`);
    }

    const sqlQuery = `
      SELECT w.Week,
             w.Title,
             w.Grade,
             w.Seq,
             w.PrereqWeek,
             prereq.Seq AS PrereqSeq,
             t.Class
      FROM dbo.Weeks w
      LEFT JOIN dbo.Weeks prereq ON w.PrereqWeek = prereq.Week
      LEFT JOIN dbo.WeekTargets t ON w.Week = t.Week
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.Seq, w.Week
    `;

    const result = await request.query(sqlQuery);

    const cardsByWeek = new Map();
    result.recordset.forEach((row) => {
      if (!cardsByWeek.has(row.Week)) {
        cardsByWeek.set(row.Week, {
          week: row.Week,
          title: row.Title,
          grade: row.Grade,
          seq: row.Seq,
          prereqWeek: row.PrereqWeek ?? null,
          prereqSeq: row.PrereqSeq ?? null,
          classes: []
        });
      }

      if (row.Class) {
        cardsByWeek.get(row.Week).classes.push(row.Class);
      }
    });

    const cards = Array.from(cardsByWeek.values()).map((card) => {
      const uniqueClasses = Array.from(new Set(card.classes));
      return {
        Week: card.week,
        Title: card.title,
        Grade: card.grade,
        Seq: card.seq,
        Classes: uniqueClasses,
        PrereqWeek: card.prereqWeek,
        PrereqSeq: card.prereqSeq
      };
    });

    context.res = ok(cards);
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
