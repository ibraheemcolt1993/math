const { getPool } = require('../_shared/db');
const { ok, response } = require('../_shared/http');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    await dbPool.request().query('SELECT 1 AS ok');
    context.res = ok({ ok: true, db: true });
  } catch (error) {
    context.res = response(200, { ok: false, db: false, error: error.message });
  }
};
