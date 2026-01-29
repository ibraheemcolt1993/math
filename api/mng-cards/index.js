const { getPool, sql } = require('../_shared/db');
const { readJson, getQuery } = require('../_shared/parse');
const { ok, badRequest, notFound, methodNotAllowed, response } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

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

function parseOptionalWeek(value) {
  if (value === null || value === undefined || value === '') return null;
  return parseWeek(value);
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

function resolveRole(session) {
  const roleValue = session?.role;
  if (roleValue === 'super' || Number(roleValue) === 1) return 'super';
  if (roleValue === 'teacher' || Number(roleValue) === 2) return 'teacher';
  return 'teacher';
}

const tableColumnsCache = new Map();

async function getTableColumns(dbPool, tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await dbPool
    .request()
    .input('table', sql.NVarChar(128), tableName)
    .query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @table;`
    );

  const columns = new Set(result.recordset.map((row) => row.COLUMN_NAME));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function renumberSeq(transaction, grade, schoolId, hasSchoolId) {
  if (!grade) return;
  const request = new sql.Request(transaction).input('grade', sql.NVarChar(50), grade);
  let whereClause = 'Grade = @grade AND IsDeleted = 0';

  if (hasSchoolId) {
    request.input('schoolId', sql.Int, schoolId);
    whereClause += ' AND SchoolId = @schoolId';
  }

  await request.query(
    `WITH Ranked AS (
       SELECT Week,
              ROW_NUMBER() OVER (ORDER BY Seq, Week) AS SeqValue
       FROM dbo.Weeks
       WHERE ${whereClause}
     )
     UPDATE w
     SET Seq = r.SeqValue
     FROM dbo.Weeks w
     JOIN Ranked r ON w.Week = r.Week;`
  );
}

async function handleGet(context, req, session) {
  const query = getQuery(req);
  const grade = normalizeDigits(toCleanString(query.grade));
  const classInput = toCleanString(query.class);
  const className = normalizeDigits(classInput);
  const q = toCleanString(query.q);
  const search = q ? `%${normalizeDigits(q)}%` : '';
  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const columns = await getTableColumns(dbPool, 'Weeks');
  const studentColumns = await getTableColumns(dbPool, 'Students');
  const hasWeeksSchoolId = columns.has('SchoolId');
  const hasWeeksCreatedByAdminId = columns.has('CreatedByAdminId');
  const hasStudentsSchoolId = studentColumns.has('SchoolId');
  const hasStudentsGrade = studentColumns.has('Grade');
  const hasStudentsClass = studentColumns.has('Class');

  const request = dbPool.request();

  const conditions = ['w.IsDeleted = 0'];
  if (hasWeeksSchoolId) {
    request.input('schoolId', sql.Int, schoolId);
    conditions.push('w.SchoolId = @schoolId');
  }
  if (role === 'teacher') {
    if (hasWeeksCreatedByAdminId) {
      request.input('adminId', sql.Int, adminId);
      conditions.push('w.CreatedByAdminId = @adminId');
    }
  }

  if (grade) {
    request.input('grade', sql.NVarChar(50), grade);
    conditions.push('w.Grade = @grade');
  }

  if (search) {
    request.input('q', sql.NVarChar(200), search);
    conditions.push('(CAST(w.Week AS NVARCHAR(20)) LIKE @q OR CAST(w.Seq AS NVARCHAR(20)) LIKE @q OR w.Title LIKE @q)');
  }

  const hasClassFilter = className && className !== 'ALL_CLASSES';
  if (hasClassFilter) {
    request.input('className', sql.NVarChar(50), className);
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week)
      OR EXISTS (
        SELECT 1 FROM dbo.WeekTargets wt WHERE wt.Week = w.Week AND wt.Class = @className
      )
    )`);
  } else if (className) {
    request.input('className', sql.NVarChar(50), className);
  }

  const countFilters = [];
  if (hasStudentsSchoolId && hasWeeksSchoolId) {
    countFilters.push('s.SchoolId = @schoolId');
  }
  if (grade && hasStudentsGrade) {
    countFilters.push('s.Grade = @grade');
  }
  if (hasClassFilter && hasStudentsClass) {
    countFilters.push('s.Class = @className');
  }

  let sqlQuery = `
    SELECT w.Week,
           w.Title,
           w.Grade,
           w.Seq,
           w.PrereqWeek,
           prereq.Seq AS PrereqSeq,
           prereq.Title AS PrereqTitle,
           t.Class,
           cc.CompletedCount
    FROM dbo.Weeks w
    LEFT JOIN dbo.Weeks prereq ON w.PrereqWeek = prereq.Week
    LEFT JOIN dbo.WeekTargets t ON w.Week = t.Week
    LEFT JOIN (
      SELECT c.Week, COUNT(*) AS CompletedCount
      FROM dbo.CardCompletions c
      JOIN dbo.Students s ON s.StudentId = c.StudentId
      ${countFilters.length ? `WHERE ${countFilters.join(' AND ')}` : ''}
      GROUP BY c.Week
    ) cc ON w.Week = cc.Week
  `;

  if (conditions.length) {
    sqlQuery += ` WHERE ${conditions.join(' AND ')}`;
  }

  sqlQuery += ' ORDER BY w.Grade, w.Seq';

  const result = await request.query(sqlQuery);

  const cardsByWeek = new Map();
  result.recordset.forEach((row) => {
    if (!cardsByWeek.has(row.Week)) {
      cardsByWeek.set(row.Week, {
        week: row.Week,
        title: row.Title,
        grade: row.Grade,
        seq: row.Seq,
        prereqWeek: row.PrereqWeek ?? null,
        prereqSeq: row.PrereqSeq ?? null,
        prereqTitle: row.PrereqTitle ?? null,
        classes: [],
        completedCount: row.CompletedCount ?? 0
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
      seq: card.seq,
      prereqWeek: card.prereqWeek,
      prereqSeq: card.prereqSeq,
      prereqTitle: card.prereqTitle,
      classes: uniqueClasses,
      completedCount: card.completedCount,
      isAllClasses: uniqueClasses.length === 0
    };
  });

  context.res = ok({ ok: true, cards });
}

async function handlePost(context, req, session) {
  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const requestedWeek = parseWeek(payload.week);
  const title = toCleanString(payload.title);
  const grade = normalizeDigits(toCleanString(payload.grade));
  const allClasses = Boolean(payload.allClasses);
  const classes = allClasses ? [] : normalizeClassList(payload.classes);
  const prereqWeekRaw = payload.prereqWeek;
  const prereqWeek = parseOptionalWeek(prereqWeekRaw);

  if (payload.week != null && !requestedWeek) {
    context.res = badRequest('week must be a valid integer.');
    return;
  }

  if (prereqWeekRaw !== undefined && prereqWeekRaw !== null && prereqWeekRaw !== '' && prereqWeek === null) {
    context.res = badRequest('prereqWeek must be a valid integer or null.');
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

  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const columns = await getTableColumns(dbPool, 'Weeks');
  const hasWeeksSchoolId = columns.has('SchoolId');
  const hasWeeksCreatedByAdminId = columns.has('CreatedByAdminId');
  let week = requestedWeek;

  if (week) {
    const existingRequest = dbPool.request().input('week', sql.Int, week);
    let existingQuery = 'SELECT Week FROM dbo.Weeks WHERE Week = @week';
    if (hasWeeksSchoolId) {
      existingRequest.input('schoolId', sql.Int, schoolId);
      existingQuery += ' AND SchoolId = @schoolId';
    }
    const existing = await existingRequest.query(existingQuery);

    if (existing.recordset.length) {
      context.res = badRequest('week already exists.');
      return;
    }
  } else {
    const maxRequest = dbPool.request();
    let maxQuery = 'SELECT ISNULL(MAX(Week), 0) AS maxWeek FROM dbo.Weeks';
    if (hasWeeksSchoolId) {
      maxRequest.input('schoolId', sql.Int, schoolId);
      maxQuery += ' WHERE SchoolId = @schoolId';
    }
    const maxResult = await maxRequest.query(maxQuery);
    week = (maxResult.recordset[0]?.maxWeek || 0) + 1;
  }

  if (prereqWeek != null) {
    if (prereqWeek === week) {
      context.res = badRequest('prereqWeek cannot match week.');
      return;
    }

    const prereqRequest = dbPool.request().input('week', sql.Int, prereqWeek);
    let prereqQuery = 'SELECT Week, Grade FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0';
    if (hasWeeksSchoolId) {
      prereqRequest.input('schoolId', sql.Int, schoolId);
      prereqQuery += ' AND SchoolId = @schoolId';
    }
    const prereqResult = await prereqRequest.query(prereqQuery);

    if (!prereqResult.recordset.length) {
      context.res = badRequest('prereqWeek does not exist.');
      return;
    }

    if (normalizeDigits(prereqResult.recordset[0].Grade) !== grade) {
      context.res = badRequest('prereqWeek must belong to the same grade.');
      return;
    }
  }

  const seqRequest = dbPool.request().input('grade', sql.NVarChar(50), grade);
  let seqQuery = 'SELECT ISNULL(MAX(Seq), 0) AS maxSeq FROM dbo.Weeks WHERE Grade = @grade AND IsDeleted = 0';
  if (hasWeeksSchoolId) {
    seqRequest.input('schoolId', sql.Int, schoolId);
    seqQuery += ' AND SchoolId = @schoolId';
  }
  const seqResult = await seqRequest.query(seqQuery);

  const nextSeq = (seqResult.recordset[0]?.maxSeq || 0) + 1;
  const createdByAdminId = role === 'teacher' ? adminId : null;

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();

    const insertRequest = new sql.Request(transaction)
      .input('week', sql.Int, week)
      .input('title', sql.NVarChar(200), title)
      .input('grade', sql.NVarChar(50), grade)
      .input('seq', sql.Int, nextSeq)
      .input('prereqWeek', sql.Int, prereqWeek);
    const insertColumns = ['Week', 'Title', 'Grade', 'Seq', 'PrereqWeek', 'IsDeleted'];
    const insertValues = ['@week', '@title', '@grade', '@seq', '@prereqWeek', '0'];

    if (hasWeeksSchoolId) {
      insertRequest.input('schoolId', sql.Int, schoolId);
      insertColumns.push('SchoolId');
      insertValues.push('@schoolId');
    }

    if (hasWeeksCreatedByAdminId) {
      insertRequest.input('createdByAdminId', sql.Int, createdByAdminId);
      insertColumns.push('CreatedByAdminId');
      insertValues.push('@createdByAdminId');
    }

    await insertRequest.query(
      `INSERT INTO dbo.Weeks (${insertColumns.join(', ')})
       VALUES (${insertValues.join(', ')});`
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
    context.res = ok({ ok: true, week, seq: nextSeq });
  } catch (error) {
    await transaction.rollback();
    context.res = serverError(error);
  }
}

async function handlePut(context, req, session) {
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
  const prereqWeekRaw = payload.prereqWeek;
  const prereqWeek = parseOptionalWeek(prereqWeekRaw);

  if (prereqWeekRaw !== undefined && prereqWeekRaw !== null && prereqWeekRaw !== '' && prereqWeek === null) {
    context.res = badRequest('prereqWeek must be a valid integer or null.');
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

  if (prereqWeek === week) {
    context.res = badRequest('prereqWeek cannot match week.');
    return;
  }

  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const columns = await getTableColumns(dbPool, 'Weeks');
  const hasWeeksSchoolId = columns.has('SchoolId');
  const hasWeeksCreatedByAdminId = columns.has('CreatedByAdminId');
  const existingRequest = dbPool
    .request()
    .input('week', sql.Int, week);
  let existingQuery = 'SELECT Week, Grade, Seq FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0';
  if (hasWeeksSchoolId) {
    existingRequest.input('schoolId', sql.Int, schoolId);
    existingQuery += ' AND SchoolId = @schoolId';
  }
  if (role === 'teacher') {
    if (hasWeeksCreatedByAdminId) {
      existingRequest.input('adminId', sql.Int, adminId);
      existingQuery += ' AND CreatedByAdminId = @adminId';
    }
  }
  const existing = await existingRequest.query(existingQuery);

  if (!existing.recordset.length) {
    context.res = notFound('Card not found.');
    return;
  }

  const current = existing.recordset[0];
  const previousGrade = normalizeDigits(current.Grade);
  const gradeChanged = previousGrade !== grade;

  if (prereqWeek != null) {
    const prereqRequest = dbPool.request().input('week', sql.Int, prereqWeek);
    let prereqQuery = 'SELECT Week, Grade FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0';
    if (hasWeeksSchoolId) {
      prereqRequest.input('schoolId', sql.Int, schoolId);
      prereqQuery += ' AND SchoolId = @schoolId';
    }
    const prereqResult = await prereqRequest.query(prereqQuery);

    if (!prereqResult.recordset.length) {
      context.res = badRequest('prereqWeek does not exist.');
      return;
    }

    if (normalizeDigits(prereqResult.recordset[0].Grade) !== grade) {
      context.res = badRequest('prereqWeek must belong to the same grade.');
      return;
    }
  }

  let nextSeq = current.Seq;
  if (gradeChanged) {
    const seqRequest = dbPool.request().input('grade', sql.NVarChar(50), grade);
    let seqQuery = 'SELECT ISNULL(MAX(Seq), 0) AS maxSeq FROM dbo.Weeks WHERE Grade = @grade AND IsDeleted = 0';
    if (hasWeeksSchoolId) {
      seqRequest.input('schoolId', sql.Int, schoolId);
      seqQuery += ' AND SchoolId = @schoolId';
    }
    const seqResult = await seqRequest.query(seqQuery);
    nextSeq = (seqResult.recordset[0]?.maxSeq || 0) + 1;
  }

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();

    const updateRequest = new sql.Request(transaction)
      .input('week', sql.Int, week)
      .input('title', sql.NVarChar(200), title)
      .input('grade', sql.NVarChar(50), grade)
      .input('seq', sql.Int, nextSeq)
      .input('prereqWeek', sql.Int, prereqWeek);
    let updateQuery = `
      UPDATE dbo.Weeks
      SET Title = @title,
          Grade = @grade,
          Seq = @seq,
          PrereqWeek = @prereqWeek
      WHERE Week = @week AND IsDeleted = 0
    `;
    if (hasWeeksSchoolId) {
      updateRequest.input('schoolId', sql.Int, schoolId);
      updateQuery += ' AND SchoolId = @schoolId';
    }
    if (role === 'teacher') {
      if (hasWeeksCreatedByAdminId) {
        updateRequest.input('adminId', sql.Int, adminId);
        updateQuery += ' AND CreatedByAdminId = @adminId';
      }
    }
    updateQuery += ';';
    await updateRequest
      .query(
        updateQuery
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

    if (gradeChanged) {
      await renumberSeq(transaction, previousGrade, schoolId, hasWeeksSchoolId);
      await renumberSeq(transaction, grade, schoolId, hasWeeksSchoolId);
    }

    await transaction.commit();
    context.res = ok({ ok: true });
  } catch (error) {
    await transaction.rollback();
    context.res = serverError(error);
  }
}

async function handleDelete(context, req, session) {
  const week = parseWeek(req.params?.week);
  if (!week) {
    context.res = badRequest('week must be a valid integer.');
    return;
  }

  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const columns = await getTableColumns(dbPool, 'Weeks');
  const hasWeeksSchoolId = columns.has('SchoolId');
  const hasWeeksCreatedByAdminId = columns.has('CreatedByAdminId');
  const existingRequest = dbPool
    .request()
    .input('week', sql.Int, week);
  let existingQuery = 'SELECT Week, Grade FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0';
  if (hasWeeksSchoolId) {
    existingRequest.input('schoolId', sql.Int, schoolId);
    existingQuery += ' AND SchoolId = @schoolId';
  }
  if (role === 'teacher') {
    if (hasWeeksCreatedByAdminId) {
      existingRequest.input('adminId', sql.Int, adminId);
      existingQuery += ' AND CreatedByAdminId = @adminId';
    }
  }
  const existing = await existingRequest.query(existingQuery);

  if (!existing.recordset.length) {
    context.res = notFound('Card not found.');
    return;
  }

  const grade = normalizeDigits(existing.recordset[0].Grade);
  const transaction = new sql.Transaction(dbPool);

  try {
    await transaction.begin();

    const deleteRequest = new sql.Request(transaction)
      .input('week', sql.Int, week);
    let deleteQuery = `
      UPDATE dbo.Weeks
      SET IsDeleted = 1
      WHERE Week = @week AND IsDeleted = 0
    `;
    if (hasWeeksSchoolId) {
      deleteRequest.input('schoolId', sql.Int, schoolId);
      deleteQuery += ' AND SchoolId = @schoolId';
    }
    if (role === 'teacher') {
      if (hasWeeksCreatedByAdminId) {
        deleteRequest.input('adminId', sql.Int, adminId);
        deleteQuery += ' AND CreatedByAdminId = @adminId';
      }
    }
    deleteQuery += '; SELECT @@ROWCOUNT AS affected;';
    const result = await deleteRequest.query(deleteQuery);

    const affected = result.recordset[0]?.affected || 0;
    if (!affected) {
      await transaction.rollback();
      context.res = notFound('Card not found.');
      return;
    }

    const prereqUpdateRequest = new sql.Request(transaction)
      .input('week', sql.Int, week);
    let prereqUpdateQuery = 'UPDATE dbo.Weeks SET PrereqWeek = NULL WHERE PrereqWeek = @week';
    if (hasWeeksSchoolId) {
      prereqUpdateRequest.input('schoolId', sql.Int, schoolId);
      prereqUpdateQuery += ' AND SchoolId = @schoolId';
    }
    prereqUpdateQuery += ';';
    await prereqUpdateRequest.query(prereqUpdateQuery);

    await new sql.Request(transaction)
      .input('week', sql.Int, week)
      .query('DELETE FROM dbo.WeekTargets WHERE Week = @week;');

    await renumberSeq(transaction, grade, schoolId, hasWeeksSchoolId);

    await transaction.commit();
    context.res = ok({ ok: true });
  } catch (error) {
    await transaction.rollback();
    context.res = serverError(error);
  }
}

module.exports = async function (context, req) {
  try {
    const session = await requireAin(req, context);
    if (!session) {
      return;
    }

    switch (req.method) {
      case 'GET':
        await handleGet(context, req, session);
        return;
      case 'POST':
        await handlePost(context, req, session);
        return;
      case 'PUT':
        await handlePut(context, req, session);
        return;
      case 'DELETE':
        await handleDelete(context, req, session);
        return;
      default:
        context.res = methodNotAllowed();
    }
  } catch (error) {
    context.log('mng-cards request failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
