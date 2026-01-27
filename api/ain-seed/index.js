const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, response } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const { hashPassword } = require('../_shared/ain-auth');

function getBootKey(req) {
  return req?.headers?.['x-boot-key'] || req?.headers?.['X-Boot-Key'] || '';
}

module.exports = async function (context, req) {
  try {
    const expectedKey = process.env.AIN_BOOT_KEY || '';
    const providedKey = getBootKey(req);

    if (!expectedKey || providedKey !== expectedKey) {
      context.res = unauthorized();
      return;
    }

    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('INVALID_JSON');
      return;
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const confirm = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';

    if (!username || !password) {
      context.res = badRequest('INVALID_INPUT');
      return;
    }

    if (password.length < 10) {
      context.res = badRequest('WEAK_PASSWORD');
      return;
    }

    if (confirm && confirm !== password) {
      context.res = badRequest('PASSWORD_MISMATCH');
      return;
    }

    const dbPool = await getPool();
    const countResult = await dbPool.request().query(
      'SELECT COUNT(*) AS total FROM dbo.AdminAuthUsers'
    );

    if (countResult.recordset[0]?.total > 0) {
      context.res = response(409, { ok: false, error: 'BOOTSTRAP_DISABLED' });
      return;
    }

    const passwordHash = await hashPassword(password);

    await dbPool
      .request()
      .input('username', sql.NVarChar(120), username)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .query(
        `INSERT INTO dbo.AdminAuthUsers (Username, PasswordHash, IsActive)
         VALUES (@username, @passwordHash, 1)`
      );

    context.res = ok({ ok: true });
  } catch (error) {
    context.log('AIN bootstrap failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
