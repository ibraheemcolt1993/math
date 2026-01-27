const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, response } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const { requireAin, verifyPassword, hashPassword } = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  const session = await requireAin(context, req);
  if (!session) {
    return;
  }

  try {
    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('Invalid JSON body.');
      return;
    }

    const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';

    if (!currentPassword || !newPassword) {
      context.res = badRequest('currentPassword and newPassword are required.');
      return;
    }

    const dbPool = await getPool();
    const userResult = await dbPool
      .request()
      .input('adminId', sql.Int, session.adminId)
      .query(
        `SELECT TOP (1)
           AdminId,
           PasswordHash
         FROM dbo.AdminAuthUsers
         WHERE AdminId = @adminId`
      );

    if (!userResult.recordset.length) {
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    const user = userResult.recordset[0];
    const match = await verifyPassword(currentPassword, user.PasswordHash);
    if (!match) {
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    const nextHash = await hashPassword(newPassword);
    await dbPool
      .request()
      .input('adminId', sql.Int, session.adminId)
      .input('passwordHash', sql.NVarChar(200), nextHash)
      .query(
        `UPDATE dbo.AdminAuthUsers
         SET PasswordHash = @passwordHash
         WHERE AdminId = @adminId;`
      );

    context.res = ok({ ok: true });
  } catch (error) {
    context.log('AIN password change failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
