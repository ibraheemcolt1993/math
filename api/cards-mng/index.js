const { getPool, sql } = require('../_shared/db');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (req.rawBody) {
    try {
      return JSON.parse(req.rawBody);
    } catch (error) {
      return null;
    }
  }

  return null;
}

module.exports = async function (context, req) {
  try {
    const dbPool = await getPool();

    if (req.method === 'GET') {
      const result = await dbPool
        .request()
        .query('SELECT Week, Title, PrereqWeek FROM Cards ORDER BY Week');

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset
      };
      return;
    }

    if (req.method !== 'PUT') {
      context.res = {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Method not allowed.' }
      };
      return;
    }

    const payload = parseBody(req);
    if (!payload || !Array.isArray(payload.cards)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'cards array is required.' }
      };
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
        .query('SELECT Week FROM Cards');
      const existingWeeks = new Set(existing.recordset.map((row) => row.Week));
      const incomingWeeks = new Set(normalized.map((card) => card.week));

      for (const card of normalized) {
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('week', sql.Int, card.week)
          .input('title', sql.NVarChar(300), card.title)
          .input('prereqWeek', sql.Int, card.prereqWeek)
          .query(
            `UPDATE Cards
             SET Title = @title, PrereqWeek = @prereqWeek
             WHERE Week = @week`
          );

        if (!updateResult.rowsAffected?.[0]) {
          await updateRequest.query(
            `INSERT INTO Cards (Week, Title, PrereqWeek)
             VALUES (@week, @title, @prereqWeek)`
          );
        }
      }

      const toDelete = Array.from(existingWeeks).filter((week) => !incomingWeeks.has(week));
      for (const week of toDelete) {
        await new sql.Request(transaction)
          .input('deleteWeek', sql.Int, week)
          .query('DELETE FROM Cards WHERE Week = @deleteWeek');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};
