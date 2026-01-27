const { ok, response } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const {
  getSessionConfig,
  getCookie,
  buildClearCookie,
  hashToken
} = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  try {
    const { cookieName } = getSessionConfig();
    const token = getCookie(req, cookieName);

    if (token) {
      const tokenHash = hashToken(token);
      const dbPool = await getPool();
      await dbPool
        .request()
        .input('tokenHash', sql.VarBinary(32), tokenHash)
        .query(
          `UPDATE dbo.AdminAuthSessions
           SET RevokedAt = GETUTCDATE()
           WHERE TokenHash = @tokenHash AND RevokedAt IS NULL;`
        );
    }

    context.res = ok(
      { ok: true },
      { 'Set-Cookie': buildClearCookie(cookieName) }
    );
  } catch (error) {
    context.log('AIN sign-out failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
