const { getPool } = require('../_shared/db');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .query('SELECT Week, Title, PrereqWeek FROM Cards ORDER BY Week');
    const normalized = result.recordset.map((card) => ({
      week: card.Week,
      title: card.Title,
      prereq: card.PrereqWeek
    }));
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: normalized
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};
