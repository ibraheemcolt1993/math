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

function normalizeGrade(value) {
  const cleaned = normalizeDigits(toCleanString(value));
  if (!cleaned) return '';
  if (/^[1-9]$/.test(cleaned)) return cleaned;

  let text = cleaned.replace(/\s+/g, '');
  text = text.replace(/^الصف/, '').replace(/^صف/, '').replace(/^ال/, '');
  text = text.replace(/[أإآ]/g, 'ا');

  const gradeMap = {
    اول: '1',
    ثاني: '2',
    ثالث: '3',
    رابع: '4',
    خامس: '5',
    سادس: '6',
    سابع: '7',
    ثامن: '8',
    تاسع: '9'
  };

  return gradeMap[text] || cleaned;
}

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidBirthYear(value) {
  return /^\d{4}$/.test(value);
}

function deriveFirstName(name) {
  const parts = toCleanString(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts[0] === 'عبد' && parts[1]) {
    return `عبد ${parts[1]}`;
  }
  return parts[0];
}

function normalizeDateString(value) {
  const cleaned = normalizeDigits(toCleanString(value));
  if (!cleaned) return '';
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function handleGet(context, req) {
  const query = getQuery(req);
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const search = q ? `%${normalizeDigits(q)}%` : '';

  const dbPool = await getPool();
  const request = dbPool.request();
  let sqlQuery =
    'SELECT StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class FROM dbo.Students';

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
  const birthDateValue = toCleanString(payload.birthDate);
  const birthDateInput = normalizeDateString(birthDateValue);
  let firstName = toCleanString(payload.firstName);
  const grade = payload.grade != null ? normalizeGrade(payload.grade) : '';
  const className = payload.class != null ? normalizeDigits(toCleanString(payload.class)) : '';

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

  if (birthDateValue && !birthDateInput) {
    context.res = badRequest('birthDate must be in YYYY-MM-DD format.');
    return;
  }

  if (!firstName) {
    firstName = deriveFirstName(name);
  }

  const birthDate = birthDateInput || `${birthYear}-01-01`;

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
    .input('firstName', sql.NVarChar(100), firstName)
    .input('birthDate', sql.Date, birthDate)
    .input('grade', sql.NVarChar(50), grade)
    .input('className', sql.NVarChar(50), className)
    .query(
      `INSERT INTO dbo.Students (StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class)
       VALUES (@studentId, @birthYear, @name, @firstName, @birthDate, @grade, @className);
       SELECT StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class
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
    .query('SELECT StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class FROM dbo.Students WHERE StudentId = @studentId');

  if (!existingResult.recordset.length) {
    context.res = notFound('Student not found.');
    return;
  }

  const existing = existingResult.recordset[0];
  const birthYear = payload.birthYear != null
    ? normalizeDigits(toCleanString(payload.birthYear))
    : existing.BirthYear;
  const name = payload.name != null ? String(payload.name).trim() : existing.Name;
  const incomingFirstName = payload.firstName != null ? String(payload.firstName).trim() : '';
  let firstName = payload.firstName != null ? incomingFirstName : existing.FirstName;
  if (payload.name != null && !incomingFirstName) {
    firstName = deriveFirstName(name);
  }
  const grade = payload.grade != null ? normalizeGrade(payload.grade) : existing.Grade;
  const className = payload.class != null ? normalizeDigits(toCleanString(payload.class)) : existing.Class;
  const birthDateValue = payload.birthDate != null ? toCleanString(payload.birthDate) : '';
  let birthDate = existing.BirthDate;

  if (!birthYear || !isValidBirthYear(birthYear)) {
    context.res = badRequest('birthYear must be a 4-digit year.');
    return;
  }

  if (!name) {
    context.res = badRequest('name is required.');
    return;
  }

  if (payload.birthDate != null) {
    const normalizedBirthDate = normalizeDateString(birthDateValue);
    if (birthDateValue && !normalizedBirthDate) {
      context.res = badRequest('birthDate must be in YYYY-MM-DD format.');
      return;
    }
    birthDate = normalizedBirthDate || `${birthYear}-01-01`;
  }

  const updateResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('birthYear', sql.NVarChar(10), birthYear)
    .input('name', sql.NVarChar(200), name)
    .input('firstName', sql.NVarChar(100), firstName)
    .input('birthDate', sql.Date, birthDate)
    .input('grade', sql.NVarChar(50), grade)
    .input('className', sql.NVarChar(50), className)
    .query(
      `UPDATE dbo.Students
       SET BirthYear = @birthYear,
           Name = @name,
           FirstName = @firstName,
           BirthDate = @birthDate,
           Grade = @grade,
           Class = @className
       WHERE StudentId = @studentId;
       SELECT StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class
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
    const session = await requireAin(req, context);
    if (!session) {
      return;
    }

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
    context.log('mng-students request failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
