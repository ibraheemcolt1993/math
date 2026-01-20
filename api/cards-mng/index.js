const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, methodNotAllowed, response } = require('../_shared/http');

module.exports = async function (context, req) {
  try {
    const dbPool = await getPool();

    if (req.method === 'GET') {
      const result = await dbPool
        .request()
        .query('SELECT Week, Title, PrereqWeek FROM dbo.Cards ORDER BY Week');

      context.res = ok(result.recordset);
      return;
    }

    if (req.method !== 'PUT') {
      context.res = methodNotAllowed();
      return;
    }

    const payload = readJson(req);
    if (!payload || !Array.isArray(payload.cards)) {
      context.res = badRequest('cards array is required.');
      return;
    }

    const normalized = payload.cards
      .map((card) => ({
        week: Number(card.week),
        title: String(card.title || '').trim(),
        prereqWeek: card.prereq == null || card.prereq === '' ? null : Number(card.prereq)
      }))
      .filter((card) => Number.isInteger(card.week) && card.title);

    const transaction = new sql.Transaction(dbPool);
    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .query('SELECT Week FROM dbo.Cards');
      const existingWeeks = new Set(existing.recordset.map((row) => row.Week));
      const incomingWeeks = new Set(normalized.map((card) => card.week));
      const allowedPrereqs = new Set([...existingWeeks, ...incomingWeeks]);
      const invalidPrereq = normalized.find(
        (card) => card.prereqWeek != null && !allowedPrereqs.has(card.prereqWeek)
      );

      if (invalidPrereq) {
        context.res = badRequest('INVALID_PREREQ_WEEK');
        await transaction.rollback();
        return;
      }

      for (const card of normalized) {
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('week', sql.Int, card.week)
          .input('title', sql.NVarChar(300), card.title)
          .input('prereqWeek', sql.Int, card.prereqWeek)
          .query(
            `UPDATE dbo.Cards
             SET Title = @title, PrereqWeek = @prereqWeek
             WHERE Week = @week`
          );

        if (!updateResult.rowsAffected?.[0]) {
          await updateRequest.query(
            `INSERT INTO dbo.Cards (Week, Title, PrereqWeek)
             VALUES (@week, @title, @prereqWeek)`
          );
        }
      }

      const toDelete = Array.from(existingWeeks).filter((week) => !incomingWeeks.has(week));
      for (const week of toDelete) {
        await new sql.Request(transaction)
          .input('deleteWeek', sql.Int, week)
          .query('DELETE FROM dbo.Cards WHERE Week = @deleteWeek');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    context.res = ok({ ok: true });
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
