const sql = require('mssql');

let pool;

function buildConfig() {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    options: {
      encrypt: String(process.env.DB_ENCRYPT).toLowerCase() === 'true',
      trustServerCertificate: false
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

async function getPool() {
  if (pool) {
    return pool;
  }

  const config = buildConfig();
  pool = await sql.connect(config);
  pool.on('error', () => {
    pool = null;
  });
  return pool;
}

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
