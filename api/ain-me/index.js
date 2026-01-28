const { ok } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  context.res = ok({
    ok: true,
    user: {
      username: session.username,
      role: session.role,
      schoolId: session.schoolId
    }
  });
};
