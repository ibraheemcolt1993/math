const { getPool, sql } = require('../_shared/db');
const { readJson, getQuery } = require('../_shared/parse');
const { ok, badRequest, notFound, methodNotAllowed, serverError } = require('../_shared/http');

function normalizeDigits(value) {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => map[digit] ?? digit);
}

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseWeek(value) {
  const cleaned = normalizeDigits(toCleanString(value));
  if (!cleaned || !/^\d+$/.test(cleaned)) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeClassList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  value.forEach((entry) => {
    const cleaned = normalizeDigits(toCleanString(entry));
    if (!cleaned) return;
    seen.add(cleaned);
  });
  return Array.from(seen);
}

async function handleGet(context, req) {
  const query = getQuery(req);
  const grade = normalizeDigits(toCleanString(query.grade));
  const className = normalizeDigits(toCleanString(query.class));
  const q = toCleanString(query.q);
  const search = q ? `%${normalizeDigits(q)}%` : '';

  const dbPool = await getPool();
  const request = dbPool.request();

  const conditions = ['w.IsDeleted = 0'];

  if (grade) {
    request.input('grade', sql.NVarChar(50), grade);
    conditions.push('w.Grade = @grade');
  }

  if (search) {
    request.input('q', sql.NVarChar(200), search);
    conditions.push('(CAST(w.Week AS NVARCHAR(20)) LIKE @q OR w.Title LIKE @q)');
  }

  if (className) {
    request.input('className', sql.NVarChar(50), className);
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week)
      OR EXISTS (
        SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week AND wt.Class = @className
      )
    )`);
  }

  let sqlQuery = `
    SELECT w.Week, w.Title, w.Grade, t.Class
    FROM dbo.Weeks w
    LEFT JOIN dbo.WeekTargets t ON w.Week = t.Week
  `;

  if (conditions.length) {
    sqlQuery += ` WHERE ${conditions.join(' AND ')}`;
  }

  sqlQuery += ' ORDER BY w.Week';

  const result = await request.query(sqlQuery);

  const cardsByWeek = new Map();
  result.recordset.forEach((row) => {
    if (!cardsByWeek.has(row.Week)) {
      cardsByWeek.set(row.Week, {
        week: row.Week,
        title: row.Title,
        grade: row.Grade,
        classes: []
      });
    }

    if (row.Class) {
      cardsByWeek.get(row.Week).classes.push(row.Class);
    }
  });

  const cards = Array.from(cardsByWeek.values()).map((card) => {
    const uniqueClasses = Array.from(new Set(card.classes));
    return {
      week: card.week,
      title: card.title,
      grade: card.grade,
      classes: uniqueClasses,
      isAllClasses: uniqueClasses.length === 0
    };
  });

  context.res = ok({ ok: true, cards });
}

async function handlePost(context, req) {
  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const week = parseWeek(payload.week);
  const title = toCleanString(payload.title);
  const grade = normalizeDigits(toCleanString(payload.grade));
  const allClasses = Boolean(payload.allClasses);
  const classes = allClasses ? [] : normalizeClassList(payload.classes);

  if (!week) {
    context.res = badRequest('week must be a valid integer.');
    return;
  }

  if (!title) {
    context.res = badRequest('title is required.');
    return;
  }

  if (!grade) {
    context.res = badRequest('grade is required.');
    return;
  }

  const dbPool = await getPool();
  const existing = await dbPool
    .request()
    .input('week', sql.Int, week)
    .query('SELECT Week FROM dbo.Weeks WHERE Week = @week');

  if (existing.recordset.length) {
    context.res = badRequest('week already exists.');
    return;
  }

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input('week', sql.Int, week)
      .input('title', sql.NVarChar(200), title)
      .input('grade', sql.NVarChar(50), grade)
      .query(
        `INSERT INTO dbo.Weeks (Week, Title, Grade, IsDeleted)
         VALUES (@week, @title, @grade, 0);`
      );

    for (const classValue of classes) {
      await new sql.Request(transaction)
        .input('week', sql.Int, week)
        .input('className', sql.NVarChar(50), classValue)
        .query(
          `INSERT INTO dbo.WeekTargets (Week, Class)
           VALUES (@week, @className);`
        );
    }

    await transaction.commit();
    context.res = ok({ ok: true });
  } catch (error) {
    await transaction.rollback();
    context.res = serverError(error);
  }
}

async function handlePut(context, req) {
  const week = parseWeek(req.params?.week);
  if (!week) {
    context.res = badRequest('week must be a valid integer.');
    return;
  }

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const title = toCleanString(payload.title);
  const grade = normalizeDigits(toCleanString(payload.grade));
  const allClasses = Boolean(payload.allClasses);
  const classes = allClasses ? [] : normalizeClassList(payload.classes);

  if (!title) {
    context.res = badRequest('title is required.');
    return;
  }

  if (!grade) {
    context.res = badRequest('grade is required.');
    return;
  }

  const dbPool = await getPool();
  const existing = await dbPool
    .request()
    .input('week', sql.Int, week)
    .query('SELECT Week FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0');

  if (!existing.recordset.length) {
    context.res = notFound('Card not found.');
    return;
  }

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input('week', sql.Int, week)
      .input('title', sql.NVarChar(200), title)
      .input('grade', sql.NVarChar(50), grade)
      .query(
        `UPDATE dbo.Weeks
         SET Title = @title,
             Grade = @grade
         WHERE Week = @week AND IsDeleted = 0;`
      );

    await new sql.Request(transaction)
      .input('week', sql.Int, week)
      .query('DELETE FROM dbo.WeekTargets WHERE Week = @week;');

    for (const classValue of classes) {
      await new sql.Request(transaction)
        .input('week', sql.Int, week)
        .input('className', sql.NVarChar(50), classValue)
        .query(
          `INSERT INTO dbo.WeekTargets (Week, Class)
           VALUES (@week, @className);`
        );
    }

    await transaction.commit();
    context.res = ok({ ok: true });
  } catch (error) {
    await transaction.rollback();
    context.res = serverError(error);
  }
}

async function handleDelete(context, req) {
  const week = parseWeek(req.params?.week);
  if (!week) {
    context.res = badRequest('week must be a valid integer.');
    return;
  }

  const dbPool = await getPool();
  const result = await dbPool
    .request()
    .input('week', sql.Int, week)
    .query(
      `UPDATE dbo.Weeks
       SET IsDeleted = 1
       WHERE Week = @week AND IsDeleted = 0;
       SELECT @@ROWCOUNT AS affected;`
    );

  const affected = result.recordset[0]?.affected || 0;
  if (!affected) {
    context.res = notFound('Card not found.');
    return;
  }

  await dbPool
    .request()
    .input('week', sql.Int, week)
    .query('DELETE FROM dbo.WeekTargets WHERE Week = @week;');

  context.res = ok({ ok: true });
}

module.exports = async function (context, req) {
  try {
    switch (req.method) {
      case 'GET':
        await handleGet(context, req);
        return;
      case 'POST':
        await handlePost(context, req);
        return;
      case 'PUT':
        await handlePut(context, req);
        return;
      case 'DELETE':
        await handleDelete(context, req);
        return;
      default:
        context.res = methodNotAllowed();
    }
  } catch (error) {
    context.res = serverError(error);
  }
};
