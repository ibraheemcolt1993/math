const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, response } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const {
  getSessionConfig,
  buildSessionCookie,
  createSession,
  verifyPassword
} = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  try {
    const payload = readJson(req);
    if (!payload) {
      context.res = badRequest('Invalid JSON body.');
      return;
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!username || !password) {
      context.res = badRequest('username and password are required.');
      return;
    }

    const dbPool = await getPool();
    const result = await dbPool
      .request()
      .input('username', sql.NVarChar(120), username)
      .query(
        `SELECT TOP (1)
           AdminId,
           Username,
           PasswordHash,
           IsActive
         FROM dbo.AdminAuthUsers
         WHERE Username = @username`
      );

    if (!result.recordset.length) {
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    const user = result.recordset[0];
    if (user.IsActive === false || user.IsActive === 0) {
      context.res = unauthorized('ACCOUNT_DISABLED');
      return;
    }

    const match = await verifyPassword(password, user.PasswordHash);
    if (!match) {
      context.res = unauthorized('INVALID_CREDENTIALS');
      return;
    }

    const { token } = await createSession(user.AdminId);
    const { sessionHours, cookieName } = getSessionConfig();
    const maxAgeSeconds = sessionHours * 60 * 60;
    const cookie = buildSessionCookie(cookieName, token, maxAgeSeconds);

    context.res = ok(
      { ok: true, user: { id: user.AdminId, username: user.Username } },
      { 'Set-Cookie': cookie }
    );
  } catch (error) {
    context.log('AIN sign-in failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
