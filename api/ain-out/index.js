const { ok, serverError } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const { buildClearCookie, requireAin } = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  try {
    const dbPool = await getPool();
    await dbPool
      .request()
      .input('tokenHash', sql.Char(64), session.tokenHash)
      .query(
        `UPDATE dbo.AdminAuthSessions
         SET RevokedAt = SYSUTCDATETIME()
         WHERE TokenHash = @tokenHash AND RevokedAt IS NULL;`
      );

    context.res = ok(
      { ok: true },
      { 'Set-Cookie': buildClearCookie() }
    );
  } catch (error) {
    context.log('AIN sign-out failed', error);
    context.res = serverError();
  }
};
