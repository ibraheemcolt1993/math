const { ok } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

module.exports = async function (context, req) {
  const session = await requireAin(context, req);
  if (!session) {
    return;
  }

  context.res = ok({ ok: true, user: { id: session.adminId, username: session.username } });
};
