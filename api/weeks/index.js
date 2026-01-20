const { getPool } = require('../_shared/db');
const { ok, response } = require('../_shared/http');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    const result = await dbPool.request().query('SELECT Week, Title FROM dbo.Weeks ORDER BY Week');
    context.res = ok(result.recordset);
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
