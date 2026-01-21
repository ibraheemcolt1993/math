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

function isValidBirthYear(value) {
  return /^\d{4}$/.test(value);
}

async function handleGet(context, req) {
  const query = getQuery(req);
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const search = q ? `%${normalizeDigits(q)}%` : '';

  const dbPool = await getPool();
  const request = dbPool.request();
  let sqlQuery =
    'SELECT StudentId, BirthYear, Name, Grade, Class FROM dbo.Students';

  if (search) {
    request.input('q', sql.NVarChar(200), search);
    sqlQuery += ' WHERE StudentId LIKE @q OR Name LIKE @q';
  }

  sqlQuery += ' ORDER BY Grade, Class, Name, StudentId';

  const result = await request.query(sqlQuery);
  context.res = ok({ ok: true, students: result.recordset });
}

async function handlePost(context, req) {
  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const studentId = normalizeDigits(toCleanString(payload.studentId));
  const birthYear = normalizeDigits(toCleanString(payload.birthYear));
  const name = toCleanString(payload.name);
  const grade = payload.grade != null ? String(payload.grade).trim() : '';
  const className = payload.class != null ? String(payload.class).trim() : '';

  if (!studentId) {
    context.res = badRequest('studentId is required.');
    return;
  }

  if (!birthYear || !isValidBirthYear(birthYear)) {
    context.res = badRequest('birthYear must be a 4-digit year.');
    return;
  }

  if (!name) {
    context.res = badRequest('name is required.');
    return;
  }

  const dbPool = await getPool();
  const existingResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .query('SELECT StudentId FROM dbo.Students WHERE StudentId = @studentId');

  if (existingResult.recordset.length) {
    context.res = badRequest('studentId already exists.');
    return;
  }

  const insertResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('birthYear', sql.NVarChar(10), birthYear)
    .input('name', sql.NVarChar(200), name)
    .input('grade', sql.NVarChar(50), grade)
    .input('className', sql.NVarChar(50), className)
    .query(
      `INSERT INTO dbo.Students (StudentId, BirthYear, Name, Grade, Class)
       VALUES (@studentId, @birthYear, @name, @grade, @className);
       SELECT StudentId, BirthYear, Name, Grade, Class
       FROM dbo.Students
       WHERE StudentId = @studentId;`
    );

  context.res = ok({ ok: true, student: insertResult.recordset[0] });
}

async function handlePut(context, req) {
  const studentId = normalizeDigits(toCleanString(req.params?.studentId));
  if (!studentId) {
    context.res = badRequest('studentId is required.');
    return;
  }

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const dbPool = await getPool();
  const existingResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .query('SELECT StudentId, BirthYear, Name, Grade, Class FROM dbo.Students WHERE StudentId = @studentId');

  if (!existingResult.recordset.length) {
    context.res = notFound('Student not found.');
    return;
  }

  const existing = existingResult.recordset[0];
  const birthYear = payload.birthYear != null
    ? normalizeDigits(toCleanString(payload.birthYear))
    : existing.BirthYear;
  const name = payload.name != null ? String(payload.name).trim() : existing.Name;
  const grade = payload.grade != null ? String(payload.grade).trim() : existing.Grade;
  const className = payload.class != null ? String(payload.class).trim() : existing.Class;

  if (!birthYear || !isValidBirthYear(birthYear)) {
    context.res = badRequest('birthYear must be a 4-digit year.');
    return;
  }

  if (!name) {
    context.res = badRequest('name is required.');
    return;
  }

  const updateResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('birthYear', sql.NVarChar(10), birthYear)
    .input('name', sql.NVarChar(200), name)
    .input('grade', sql.NVarChar(50), grade)
    .input('className', sql.NVarChar(50), className)
    .query(
      `UPDATE dbo.Students
       SET BirthYear = @birthYear,
           Name = @name,
           Grade = @grade,
           Class = @className
       WHERE StudentId = @studentId;
       SELECT StudentId, BirthYear, Name, Grade, Class
       FROM dbo.Students
       WHERE StudentId = @studentId;`
    );

  context.res = ok({ ok: true, student: updateResult.recordset[0] });
}

async function handleDelete(context, req) {
  const studentId = normalizeDigits(toCleanString(req.params?.studentId));
  if (!studentId) {
    context.res = badRequest('studentId is required.');
    return;
  }

  const dbPool = await getPool();
  const result = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .query(
      `DELETE FROM dbo.Students
       WHERE StudentId = @studentId;
       SELECT @@ROWCOUNT AS affected;`
    );

  const affected = result.recordset[0]?.affected || 0;
  if (!affected) {
    context.res = notFound('Student not found.');
    return;
  }

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
