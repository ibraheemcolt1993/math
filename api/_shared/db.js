const sql = require('mssql');

let pool;

async function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING is not set.');
  }

  pool = await sql.connect(connectionString);
  pool.on('error', () => {
    pool = null;
  });
  return pool;
}

module.exports = {
  sql,
  getPool
};
