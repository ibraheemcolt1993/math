const { getPool } = require('../_shared/db');
const { ok, response } = require('../_shared/http');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .query('SELECT Week, Title, PrereqWeek FROM dbo.Cards ORDER BY Week');
    const normalized = result.recordset.map((card) => ({
      week: card.Week,
      title: card.Title,
      prereq: card.PrereqWeek
    }));
    context.res = ok(normalized);
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
