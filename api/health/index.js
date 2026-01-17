const { getPool } = require('../_shared/db');

module.exports = async function (context) {
  try {
    const dbPool = await getPool();
    await dbPool.request().query('SELECT 1 AS ok');
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, db: true }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, db: false, error: error.message }
    };
  }
};
