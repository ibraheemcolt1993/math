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
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function resolveRole(session) {
  const roleValue = session?.role;
  if (roleValue === 'super' || Number(roleValue) === 1) return 'super';
  if (roleValue === 'teacher' || Number(roleValue) === 2) return 'teacher';
  return 'teacher';
}

function resolveSchoolId(value, fallback) {
  const cleaned = normalizeDigits(toCleanString(value));
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function handleGet(context, req, session) {
  const query = getQuery(req);
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const search = q ? `%${normalizeDigits(q)}%` : '';
  const role = resolveRole(session);
  const adminId = session?.adminId;
  const sessionSchoolId = session?.schoolId;
  const resolvedSchoolId = role === 'super'
    ? resolveSchoolId(query.schoolId, sessionSchoolId)
    : sessionSchoolId;
  const schoolId = Number.isFinite(resolvedSchoolId) ? resolvedSchoolId : null;

  const dbPool = await getPool();
  const request = dbPool.request();
  const conditions = [];
  if (schoolId !== null) {
    request.input('schoolId', sql.Int, schoolId);
    conditions.push('s.SchoolId = @schoolId');
  }

  let sqlQuery =
    'SELECT s.StudentId, s.BirthYear, s.Name, s.FirstName, s.BirthDate, s.Grade, s.Class FROM dbo.Students s';

  if (role === 'teacher') {
    request.input('adminId', sql.Int, adminId);
    sqlQuery += ' JOIN dbo.StudentAdmins sa ON sa.StudentId = s.StudentId AND sa.SchoolId = s.SchoolId';
    conditions.push('sa.AdminId = @adminId');
  }

  if (search) {
    request.input('q', sql.NVarChar(200), search);
    conditions.push('(s.StudentId LIKE @q OR s.Name LIKE @q)');
  }

  if (conditions.length) {
    sqlQuery += ` WHERE ${conditions.join(' AND ')}`;
  }
  sqlQuery += ' ORDER BY Grade, Class, Name, StudentId';

  const result = await request.query(sqlQuery);
  context.res = ok({ ok: true, students: result.recordset });
}

async function handlePost(context, req, session) {
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
  const gradeInput = payload.grade != null ? normalizeGrade(payload.grade) : '';
  const grade = toNullableInt(gradeInput);
  const classInput = payload.class != null ? normalizeDigits(toCleanString(payload.class)) : '';
  const className = toNullableInt(classInput);

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

  if (grade === null) {
    context.res = badRequest('grade is required.');
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
  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const existingResult = await dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('schoolId', sql.Int, schoolId)
    .query('SELECT StudentId FROM dbo.Students WHERE StudentId = @studentId AND SchoolId = @schoolId');

  if (existingResult.recordset.length) {
    context.res = badRequest('studentId already exists.');
    return;
  }

  const transaction = new sql.Transaction(dbPool);
  await transaction.begin();
  try {
    const insertResult = await new sql.Request(transaction)
      .input('studentId', sql.NVarChar(20), studentId)
      .input('birthYear', sql.NVarChar(10), birthYear)
      .input('name', sql.NVarChar(200), name)
      .input('firstName', sql.NVarChar(100), firstName)
      .input('birthDate', sql.Date, birthDate)
      .input('grade', sql.Int, grade)
      .input('className', sql.Int, className)
      .input('schoolId', sql.Int, schoolId)
      .query(
        `INSERT INTO dbo.Students (StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class, SchoolId)
         VALUES (@studentId, @birthYear, @name, @firstName, @birthDate, @grade, @className, @schoolId);
         SELECT StudentId, BirthYear, Name, FirstName, BirthDate, Grade, Class
         FROM dbo.Students
         WHERE StudentId = @studentId AND SchoolId = @schoolId;`
      );

    if (role === 'teacher') {
      await new sql.Request(transaction)
        .input('studentId', sql.NVarChar(20), studentId)
        .input('adminId', sql.Int, adminId)
        .input('schoolId', sql.Int, schoolId)
        .query(
          `INSERT INTO dbo.StudentAdmins (SchoolId, StudentId, AdminId)
           VALUES (@schoolId, @studentId, @adminId);`
        );
    }

    await transaction.commit();
    context.res = ok({ ok: true, student: insertResult.recordset[0] });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function handlePut(context, req, session) {
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

  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const existingRequest = dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('schoolId', sql.Int, schoolId);
  let existingQuery = `
    SELECT s.StudentId, s.BirthYear, s.Name, s.FirstName, s.BirthDate, s.Grade, s.Class
    FROM dbo.Students s
  `;
  if (role === 'teacher') {
    existingRequest.input('adminId', sql.Int, adminId);
    existingQuery += ' JOIN dbo.StudentAdmins sa ON sa.StudentId = s.StudentId AND sa.SchoolId = s.SchoolId';
  }
  existingQuery += ' WHERE s.StudentId = @studentId AND s.SchoolId = @schoolId';
  if (role === 'teacher') {
    existingQuery += ' AND sa.AdminId = @adminId';
  }
  const existingResult = await existingRequest.query(existingQuery);

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
  const gradeInput = payload.grade != null ? normalizeGrade(payload.grade) : existing.Grade;
  const grade = toNullableInt(gradeInput);
  const classInput = payload.class != null ? normalizeDigits(toCleanString(payload.class)) : existing.Class;
  const className = toNullableInt(classInput);
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

  if (grade === null) {
    context.res = badRequest('grade is required.');
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

  const updateRequest = dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('birthYear', sql.NVarChar(10), birthYear)
    .input('name', sql.NVarChar(200), name)
    .input('firstName', sql.NVarChar(100), firstName)
    .input('birthDate', sql.Date, birthDate)
    .input('grade', sql.Int, grade)
    .input('className', sql.Int, className)
    .input('schoolId', sql.Int, schoolId);
  let updateQuery = `
    UPDATE dbo.Students
    SET BirthYear = @birthYear,
        Name = @name,
        FirstName = @firstName,
        BirthDate = @birthDate,
        Grade = @grade,
        Class = @className
    WHERE StudentId = @studentId AND SchoolId = @schoolId
  `;
  if (role === 'teacher') {
    updateRequest.input('adminId', sql.Int, adminId);
    updateQuery += `
      AND EXISTS (
        SELECT 1
        FROM dbo.StudentAdmins sa
        WHERE sa.StudentId = dbo.Students.StudentId
          AND sa.AdminId = @adminId
          AND sa.SchoolId = @schoolId
      )
    `;
  }
  updateQuery += ';';
  updateQuery += `
    SELECT s.StudentId, s.BirthYear, s.Name, s.FirstName, s.BirthDate, s.Grade, s.Class
    FROM dbo.Students s
  `;
  if (role === 'teacher') {
    updateQuery += ' JOIN dbo.StudentAdmins sa ON sa.StudentId = s.StudentId AND sa.SchoolId = s.SchoolId';
  }
  updateQuery += ' WHERE s.StudentId = @studentId AND s.SchoolId = @schoolId';
  if (role === 'teacher') {
    updateQuery += ' AND sa.AdminId = @adminId';
  }
  const updateResult = await updateRequest.query(updateQuery);

  context.res = ok({ ok: true, student: updateResult.recordset[0] });
}

async function handleDelete(context, req, session) {
  const studentId = normalizeDigits(toCleanString(req.params?.studentId));
  if (!studentId) {
    context.res = badRequest('studentId is required.');
    return;
  }

  const role = resolveRole(session);
  const adminId = session?.adminId;
  const schoolId = session?.schoolId;

  const dbPool = await getPool();
  const deleteRequest = dbPool
    .request()
    .input('studentId', sql.NVarChar(20), studentId)
    .input('schoolId', sql.Int, schoolId);
  let deleteQuery = `
    DELETE FROM dbo.Students
    WHERE StudentId = @studentId AND SchoolId = @schoolId
  `;
  if (role === 'teacher') {
    deleteRequest.input('adminId', sql.Int, adminId);
    deleteQuery += `
      AND EXISTS (
        SELECT 1
        FROM dbo.StudentAdmins sa
        WHERE sa.StudentId = dbo.Students.StudentId
          AND sa.AdminId = @adminId
          AND sa.SchoolId = @schoolId
      )
    `;
  }
  deleteQuery += '; SELECT @@ROWCOUNT AS affected;';
  const result = await deleteRequest.query(deleteQuery);

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
    context.log('mng-students request failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
