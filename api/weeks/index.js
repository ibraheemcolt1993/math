const { getPool } = require('../_shared/db');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    const result = await dbPool.request().query('SELECT Week, Title FROM Weeks ORDER BY Week');
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
