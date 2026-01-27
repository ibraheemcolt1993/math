const { readJson } = require('../_shared/parse');
const { ok, badRequest, unauthorized, serverError } = require('../_shared/http');
const { getPool, sql } = require('../_shared/db');
const {
  getSessionConfig,
  buildSetCookie,
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
      .input('username', sql.NVarChar(64), username)
      .query(
        `SELECT TOP (1)
           AdminId,
           Username,
           PasswordHash,
           IsActive,
           FailedCount,
           LockoutUntil
         FROM dbo.AdminAuthUsers
         WHERE Username = @username`
      );

    if (!result.recordset.length) {
      context.res = unauthorized();
      return;
    }

    const user = result.recordset[0];
    if (user.IsActive === false || user.IsActive === 0) {
      context.res = unauthorized();
      return;
    }

    const now = new Date();
    if (user.LockoutUntil && new Date(user.LockoutUntil) > now) {
      context.res = unauthorized();
      return;
    }

    const match = await verifyPassword(password, user.PasswordHash);
    if (!match) {
      const nextFailed = (user.FailedCount ?? 0) + 1;
      const lockoutUntil = nextFailed >= 5
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null;

      await dbPool
        .request()
        .input('adminId', sql.Int, user.AdminId)
        .input('failedCount', sql.Int, nextFailed)
        .input('lockoutUntil', sql.DateTime2, lockoutUntil)
        .query(
          `UPDATE dbo.AdminAuthUsers
           SET FailedCount = @failedCount,
               LockoutUntil = @lockoutUntil
           WHERE AdminId = @adminId;`
        );

      context.res = unauthorized();
      return;
    }

    const { sessionHours } = getSessionConfig();
    const { token } = await createSession(user.AdminId, sessionHours);
    const maxAgeSeconds = sessionHours * 60 * 60;
    const cookie = buildSetCookie(token, maxAgeSeconds);

    await dbPool
      .request()
      .input('adminId', sql.Int, user.AdminId)
      .query(
        `UPDATE dbo.AdminAuthUsers
         SET FailedCount = 0,
             LockoutUntil = NULL
         WHERE AdminId = @adminId;`
      );

    context.res = ok(
      { ok: true, user: { id: user.AdminId, username: user.Username } },
      { 'Set-Cookie': cookie }
    );
  } catch (error) {
    context.log('AIN sign-in failed', error);
    context.res = serverError();
  }
};
