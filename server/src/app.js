const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('./db');

const app = express();

const environment = process.env.NODE_ENV || '';
const isDevelopment = environment === 'development';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (!allowedOrigins.length && !isDevelopment) {
        return callback(
          new Error(
            'CORS misconfiguration: ALLOWED_ORIGINS must be set in non-development environments.'
          )
        );
      }
      if (isDevelopment && !allowedOrigins.length) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
  })
);

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', '..', 'public')));

const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev-admin-secret';
const adminJwtOptions = { expiresIn: '8h' };

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
let adminColumnsCache = null;

function createLegacyPasswordHash(password, salt) {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('hex');
}

function createUnsaltedPasswordHash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createLegacySalt() {
  return crypto.randomBytes(16).toString('hex');
}

function safeEqualHex(left, right) {
  const leftBuf = Buffer.from(String(left || ''), 'hex');
  const rightBuf = Buffer.from(String(right || ''), 'hex');
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

async function verifyAdminPassword(password, admin) {
  const hashType = String(admin.PasswordHashType || '').toLowerCase();
  if (hashType === 'bcrypt' && admin.PasswordHash) {
    return bcrypt.compare(password, admin.PasswordHash);
  }

  if (!admin.PasswordHash) {
    return false;
  }

  if (admin.PasswordSalt) {
    const legacyHash = createLegacyPasswordHash(password, admin.PasswordSalt);
    return safeEqualHex(legacyHash, admin.PasswordHash);
  }

  if (admin.PasswordHash.startsWith('$2')) {
    return bcrypt.compare(password, admin.PasswordHash);
  }

  if (admin.PasswordHash.length === 64) {
    const unsaltedHash = createUnsaltedPasswordHash(password);
    return safeEqualHex(unsaltedHash, admin.PasswordHash);
  }

  return admin.PasswordHash === password;
}

async function loadAdminColumns(pool) {
  if (adminColumnsCache) return adminColumnsCache;
  const result = await pool
    .request()
    .query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'AdminUsers'`
    );
  const columns = new Set(result.recordset.map((row) => row.COLUMN_NAME));
  const adminIdColumn = columns.has('AdminId')
    ? 'AdminId'
    : columns.has('AdminUserId')
    ? 'AdminUserId'
    : 'AdminId';
  adminColumnsCache = {
    adminIdColumn,
    hasSalt: columns.has('PasswordSalt'),
    hasHashType: columns.has('PasswordHashType')
  };
  return adminColumnsCache;
}

async function fetchAdminByUsername(pool, username) {
  const columns = await loadAdminColumns(pool);
  const selectSalt = columns.hasSalt
    ? 'PasswordSalt'
    : 'CAST(NULL AS NVARCHAR(64)) AS PasswordSalt';
  const selectHashType = columns.hasHashType
    ? 'PasswordHashType'
    : 'CAST(NULL AS NVARCHAR(20)) AS PasswordHashType';
  const result = await pool
    .request()
    .input('username', sql.NVarChar(80), username)
    .query(
      `SELECT ${columns.adminIdColumn} AS AdminId,
              Username,
              PasswordHash,
              ${selectSalt},
              ${selectHashType},
              IsActive
       FROM AdminUsers
       WHERE Username = @username`
    );
  return { columns, admin: result.recordset[0] };
}

async function upgradeAdminPassword(pool, adminId, password, columns) {
  const bcryptHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const request = pool
    .request()
    .input('adminId', sql.Int, adminId)
    .input('passwordHash', sql.NVarChar(255), bcryptHash);
  const setClauses = ['PasswordHash = @passwordHash', 'UpdatedAt = SYSUTCDATETIME()'];

  if (columns.hasSalt) {
    request.input('passwordSalt', sql.NVarChar(64), null);
    setClauses.push('PasswordSalt = @passwordSalt');
  }
  if (columns.hasHashType) {
    request.input('passwordHashType', sql.NVarChar(20), 'bcrypt');
    setClauses.push('PasswordHashType = @passwordHashType');
  }

  await request.query(
    `UPDATE AdminUsers
     SET ${setClauses.join(', ')}
     WHERE ${columns.adminIdColumn} = @adminId`
  );
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

function requireAdminToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
  }

  try {
    const payload = jwt.verify(token, adminJwtSecret);
    req.admin = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_INVALID' });
  }
}

app.get('/api/health', async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, db: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/weeks', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT Week, Title FROM Weeks ORDER BY Week');
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cards', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        'SELECT Week AS week, Title AS title, PrereqWeek AS prereq FROM Cards ORDER BY Week'
      );
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Missing admin credentials.' });
    }

    const pool = await getPool();
    const { columns, admin } = await fetchAdminByUsername(pool, username);

    if (!admin) {
      return res.status(401).json({ ok: false, error: 'INVALID_ADMIN_LOGIN' });
    }

    if (admin.IsActive === false || admin.IsActive === 0) {
      return res.status(403).json({ ok: false, error: 'ADMIN_DISABLED' });
    }

    const passwordOk = await verifyAdminPassword(password, admin);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'INVALID_ADMIN_LOGIN' });
    }
    const hashType = String(admin.PasswordHashType || '').toLowerCase();
    if (hashType !== 'bcrypt') {
      await upgradeAdminPassword(pool, admin.AdminId, password, columns);
    }

    const token = jwt.sign(
      { adminId: admin.AdminId, username: admin.Username },
      adminJwtSecret,
      adminJwtOptions
    );
    res.json({ ok: true, user: { username: admin.Username }, token });
  } catch (error) {
    next(error);
  }
});

app.use('/api/astu', requireAdminToken);
app.use('/api/cards-mng', requireAdminToken);
app.use('/api/admin/password', requireAdminToken);

app.put('/api/admin/password', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const currentPassword = String(req.body?.currentPassword || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    const tokenUsername = req.admin?.username ? String(req.admin.username) : '';
    const effectiveUsername = username || tokenUsername;

    if (!effectiveUsername || !currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Missing password payload.' });
    }

    if (tokenUsername && username && tokenUsername !== username) {
      return res.status(403).json({ ok: false, error: 'ADMIN_AUTH_MISMATCH' });
    }

    const pool = await getPool();
    const { columns, admin } = await fetchAdminByUsername(pool, effectiveUsername);

    if (!admin) {
      return res.status(404).json({ ok: false, error: 'ADMIN_NOT_FOUND' });
    }

    if (admin.IsActive === false || admin.IsActive === 0) {
      return res.status(403).json({ ok: false, error: 'ADMIN_DISABLED' });
    }

    const passwordOk = await verifyAdminPassword(currentPassword, admin);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'INVALID_ADMIN_LOGIN' });
    }

    const nextHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const request = pool
      .request()
      .input('adminId', sql.Int, admin.AdminId)
      .input('passwordHash', sql.NVarChar(255), nextHash);
    const setClauses = ['PasswordHash = @passwordHash', 'UpdatedAt = SYSUTCDATETIME()'];

    if (columns.hasSalt) {
      request.input('passwordSalt', sql.NVarChar(64), null);
      setClauses.push('PasswordSalt = @passwordSalt');
    }
    if (columns.hasHashType) {
      request.input('passwordHashType', sql.NVarChar(20), 'bcrypt');
      setClauses.push('PasswordHashType = @passwordHashType');
    }

    await request.query(
      `UPDATE AdminUsers
       SET ${setClauses.join(', ')}
       WHERE ${columns.adminIdColumn} = @adminId`
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/students/login', async (req, res, next) => {
  try {
    const studentId = String(req.body?.studentId || '').trim();
    const birthYear = String(req.body?.birthYear || '').trim();

    if (!studentId || !birthYear) {
      return res.status(400).json({ ok: false, error: 'Missing student credentials.' });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .input('birthYear', sql.NVarChar(10), birthYear)
      .query(
        `SELECT StudentId, BirthYear, FirstName, FullName, Class
         FROM Students
         WHERE StudentId = @studentId AND BirthYear = @birthYear`
      );

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, error: 'Student not found.' });
    }

    const student = result.recordset[0];
    const payload = {
      StudentId: student.StudentId,
      BirthYear: student.BirthYear,
      FirstName: student.FirstName,
      FullName: student.FullName,
      Class: student.Class
    };
    res.json({
      ok: true,
      student: payload,
      ...payload
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:studentId/completions', async (req, res, next) => {
  try {
    const studentId = String(req.params.studentId || '').trim();
    if (!studentId) {
      return res.status(400).json({ ok: false, error: 'Missing studentId.' });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .query(
        `SELECT CompletionId, StudentId, Week, FinalScore, CompletedAt
         FROM CardCompletions
         WHERE StudentId = @studentId
         ORDER BY Week`
      );

    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students/:studentId/completions', async (req, res, next) => {
  try {
    const studentId = String(req.params.studentId || '').trim();
    const week = Number(req.body?.week);
    const finalScore = Number.isFinite(Number(req.body?.finalScore))
      ? Number(req.body.finalScore)
      : 0;

    if (!studentId || !Number.isInteger(week)) {
      return res.status(400).json({ ok: false, error: 'Invalid completion payload.' });
    }

    const pool = await getPool();
    const existing = await pool
      .request()
      .input('studentId', sql.NVarChar(20), studentId)
      .input('week', sql.Int, week)
      .query(
        `SELECT CompletionId
         FROM CardCompletions
         WHERE StudentId = @studentId AND Week = @week`
      );

    if (existing.recordset.length) {
      await pool
        .request()
        .input('studentId', sql.NVarChar(20), studentId)
        .input('week', sql.Int, week)
        .input('finalScore', sql.Int, finalScore)
        .query(
          `UPDATE CardCompletions
           SET FinalScore = @finalScore, CompletedAt = GETDATE()
           WHERE StudentId = @studentId AND Week = @week`
        );
    } else {
      await pool
        .request()
        .input('studentId', sql.NVarChar(20), studentId)
        .input('week', sql.Int, week)
        .input('finalScore', sql.Int, finalScore)
        .query(
          `INSERT INTO CardCompletions (StudentId, Week, FinalScore, CompletedAt)
           VALUES (@studentId, @week, @finalScore, GETDATE())`
        );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/astu', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        `SELECT StudentId, BirthYear, FirstName, FullName, Class
         FROM Students
         ORDER BY StudentId`
      );
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.put('/api/astu', async (req, res, next) => {
  try {
    const students = Array.isArray(req.body?.students) ? req.body.students : [];
    const replaceAll = req.body?.replaceAll === true;
    const normalized = students
      .map((student) => ({
        studentId: String(student.studentId || student.id || '').trim(),
        birthYear: String(student.birthYear || '').trim(),
        firstName: String(student.firstName || '').trim(),
        fullName: String(student.fullName || '').trim(),
        class: String(student.class || '').trim()
      }))
      .filter((student) => student.studentId && student.birthYear);

    if (normalized.length === 0 && !replaceAll) {
      return res.status(400).json({ ok: false, error: 'EMPTY_STUDENT_LIST' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .query('SELECT StudentId FROM Students');
      const existingIds = new Set(existing.recordset.map((row) => row.StudentId));
      const incomingIds = new Set(normalized.map((student) => student.studentId));

      for (const student of normalized) {
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('studentId', sql.NVarChar(20), student.studentId)
          .input('birthYear', sql.NVarChar(10), student.birthYear)
          .input('firstName', sql.NVarChar(100), student.firstName)
          .input('fullName', sql.NVarChar(200), student.fullName)
          .input('class', sql.NVarChar(20), student.class)
          .query(
            `UPDATE Students
             SET BirthYear = @birthYear, FirstName = @firstName, FullName = @fullName, Class = @class
             WHERE StudentId = @studentId`
          );

        if (!updateResult.rowsAffected?.[0]) {
          await updateRequest.query(
            `INSERT INTO Students (StudentId, BirthYear, FirstName, FullName, Class)
             VALUES (@studentId, @birthYear, @firstName, @fullName, @class)`
          );
        }
      }

      const toDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
      for (const studentId of toDelete) {
        await new sql.Request(transaction)
          .input('deleteId', sql.NVarChar(20), studentId)
          .query('DELETE FROM Students WHERE StudentId = @deleteId');
      }

      await transaction.commit();
      res.json({ ok: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/cards-mng', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT Week, Title, PrereqWeek FROM Cards ORDER BY Week');
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.put('/api/cards-mng', async (req, res, next) => {
  try {
    const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];
    const normalized = cards
      .map((card) => ({
        week: Number(card.week),
        title: String(card.title || '').trim(),
        prereqWeek: card.prereq == null || card.prereq === ''
          ? null
          : Number(card.prereq)
      }))
      .filter((card) => Number.isInteger(card.week) && card.title);

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      const existing = await request.query('SELECT Week FROM Cards');
      const existingWeeks = new Set(existing.recordset.map((row) => row.Week));
      const incomingWeeks = new Set(normalized.map((card) => card.week));
      const allowedPrereqs = new Set([...existingWeeks, ...incomingWeeks]);
      const invalidPrereq = normalized.find(
        (card) => card.prereqWeek != null && !allowedPrereqs.has(card.prereqWeek)
      );

      if (invalidPrereq) {
        await transaction.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_PREREQ_WEEK' });
      }

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
        const deleteRequest = new sql.Request(transaction);
        await deleteRequest
          .input('deleteWeek', sql.Int, week)
          .query('DELETE FROM Cards WHERE Week = @deleteWeek');
      }

      await transaction.commit();
      res.json({ ok: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/weeks/:week', async (req, res, next) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week)) {
      return res.status(400).json({ ok: false, error: 'Invalid week parameter.' });
    }

    const pool = await getPool();
    const weekResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query('SELECT Week, Title FROM Weeks WHERE Week = @week');

    if (!weekResult.recordset.length) {
      return res.status(404).json({ ok: false, error: 'Week not found.' });
    }

    const goalsResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT GoalId, Week, SortOrder, GoalText FROM WeekGoals WHERE Week = @week ORDER BY SortOrder'
      );

    const prereqResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT PrerequisiteId, Week, SortOrder, PrerequisiteText FROM WeekPrerequisites WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT ConceptId, Week, SortOrder, Title FROM Concepts WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptIds = conceptResult.recordset.map((concept) => concept.ConceptId);
    let flowItemsResult = { recordset: [] };
    let flowDetailsResult = { recordset: [] };
    let flowHintsResult = { recordset: [] };
    let flowChoicesResult = { recordset: [] };

    if (conceptIds.length) {
      const inClause = conceptIds.map((_, index) => `@concept${index}`).join(',');
      const flowRequest = pool.request();
      conceptIds.forEach((id, index) => {
        flowRequest.input(`concept${index}`, sql.Int, id);
      });

      flowItemsResult = await flowRequest.query(
        `SELECT FlowItemId, ConceptId, SortOrder, ItemType, ItemText, ItemTitle, ItemDescription, ItemUrl, Answer, CorrectIndex, Solution
         FROM FlowItems
         WHERE ConceptId IN (${inClause})
         ORDER BY ConceptId, SortOrder`
      );

      const flowItemIds = flowItemsResult.recordset.map((item) => item.FlowItemId);
      if (flowItemIds.length) {
        const itemClause = flowItemIds.map((_, index) => `@item${index}`).join(',');
        const itemRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          itemRequest.input(`item${index}`, sql.Int, id);
        });

        flowDetailsResult = await itemRequest.query(
          `SELECT FlowItemDetailId, FlowItemId, SortOrder, DetailText
           FROM FlowItemDetails
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const hintRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          hintRequest.input(`item${index}`, sql.Int, id);
        });
        flowHintsResult = await hintRequest.query(
          `SELECT FlowItemHintId, FlowItemId, SortOrder, HintText
           FROM FlowItemHints
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const choiceRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          choiceRequest.input(`item${index}`, sql.Int, id);
        });
        flowChoicesResult = await choiceRequest.query(
          `SELECT FlowItemChoiceId, FlowItemId, SortOrder, ChoiceText
           FROM FlowItemChoices
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );
      }
    }

    const assessmentsResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT AssessmentId, Week, Title, Description FROM Assessments WHERE Week = @week ORDER BY AssessmentId'
      );

    const assessmentIds = assessmentsResult.recordset.map(
      (assessment) => assessment.AssessmentId
    );
    let assessmentQuestionsResult = { recordset: [] };
    let assessmentChoicesResult = { recordset: [] };

    if (assessmentIds.length) {
      const assessmentClause = assessmentIds.map((_, index) => `@assessment${index}`).join(',');
      const assessmentRequest = pool.request();
      assessmentIds.forEach((id, index) => {
        assessmentRequest.input(`assessment${index}`, sql.Int, id);
      });

      assessmentQuestionsResult = await assessmentRequest.query(
        `SELECT AssessmentQuestionId, AssessmentId, SortOrder, QuestionType, QuestionText, Answer, Points, CorrectIndex
         FROM AssessmentQuestions
         WHERE AssessmentId IN (${assessmentClause})
         ORDER BY AssessmentId, SortOrder`
      );

      const questionIds = assessmentQuestionsResult.recordset.map(
        (question) => question.AssessmentQuestionId
      );

      if (questionIds.length) {
        const questionClause = questionIds.map((_, index) => `@question${index}`).join(',');
        const questionRequest = pool.request();
        questionIds.forEach((id, index) => {
          questionRequest.input(`question${index}`, sql.Int, id);
        });

        assessmentChoicesResult = await questionRequest.query(
          `SELECT AssessmentChoiceId, AssessmentQuestionId, SortOrder, ChoiceText
           FROM AssessmentQuestionChoices
           WHERE AssessmentQuestionId IN (${questionClause})
           ORDER BY AssessmentQuestionId, SortOrder`
        );
      }
    }

    const detailsByItem = new Map();
    flowDetailsResult.recordset.forEach((detail) => {
      if (!detailsByItem.has(detail.FlowItemId)) {
        detailsByItem.set(detail.FlowItemId, []);
      }
      detailsByItem.get(detail.FlowItemId).push(detail);
    });

    const hintsByItem = new Map();
    flowHintsResult.recordset.forEach((hint) => {
      if (!hintsByItem.has(hint.FlowItemId)) {
        hintsByItem.set(hint.FlowItemId, []);
      }
      hintsByItem.get(hint.FlowItemId).push(hint);
    });

    const choicesByItem = new Map();
    flowChoicesResult.recordset.forEach((choice) => {
      if (!choicesByItem.has(choice.FlowItemId)) {
        choicesByItem.set(choice.FlowItemId, []);
      }
      choicesByItem.get(choice.FlowItemId).push(choice);
    });

    const flowItemsByConcept = new Map();
    flowItemsResult.recordset.forEach((item) => {
      if (!flowItemsByConcept.has(item.ConceptId)) {
        flowItemsByConcept.set(item.ConceptId, []);
      }
      flowItemsByConcept.get(item.ConceptId).push({
        item,
        details: detailsByItem.get(item.FlowItemId) || [],
        hints: hintsByItem.get(item.FlowItemId) || [],
        choices: choicesByItem.get(item.FlowItemId) || []
      });
    });

    const concepts = conceptResult.recordset.map((concept) => ({
      concept,
      flow: flowItemsByConcept.get(concept.ConceptId) || []
    }));

    const choicesByQuestion = new Map();
    assessmentChoicesResult.recordset.forEach((choice) => {
      if (!choicesByQuestion.has(choice.AssessmentQuestionId)) {
        choicesByQuestion.set(choice.AssessmentQuestionId, []);
      }
      choicesByQuestion.get(choice.AssessmentQuestionId).push(choice);
    });

    const questionsByAssessment = new Map();
    assessmentQuestionsResult.recordset.forEach((question) => {
      if (!questionsByAssessment.has(question.AssessmentId)) {
        questionsByAssessment.set(question.AssessmentId, []);
      }
      questionsByAssessment.get(question.AssessmentId).push({
        question,
        choices: choicesByQuestion.get(question.AssessmentQuestionId) || []
      });
    });

    const assessments = assessmentsResult.recordset.map((assessment) => ({
      assessment,
      questions: questionsByAssessment.get(assessment.AssessmentId) || []
    }));

    const weekData = weekResult.recordset[0];
    const goals = goalsResult.recordset.map((goal) => goal.GoalText);
    const prerequisites = prereqResult.recordset.map((req) => req.PrerequisiteText);

    const normalizedConcepts = concepts.map(({ concept, flow }) => ({
      title: concept.Title,
      flow: flow.map(({ item, details, hints, choices }) => {
        const type = String(item.ItemType || '').trim().toLowerCase();
        const mapped = {
          type,
          text: item.ItemText,
          title: item.ItemTitle,
          description: item.ItemDescription,
          url: item.ItemUrl,
          answer: item.Answer,
          correctIndex: item.CorrectIndex,
          solution: item.Solution,
          details: details.map((detail) => detail.DetailText),
          hints: hints.map((hint) => hint.HintText),
          choices: choices.map((choice) => choice.ChoiceText)
        };

        if (!mapped.details.length) delete mapped.details;
        if (!mapped.hints.length) delete mapped.hints;
        if (!mapped.choices.length) delete mapped.choices;

        return mapped;
      })
    }));

    const normalizedAssessments = assessments.map(({ assessment, questions }) => ({
      title: assessment.Title,
      description: assessment.Description,
      questions: questions.map(({ question, choices }) => {
        const rawType = String(question.QuestionType || '').trim().toLowerCase();
        const choiceTexts = choices.map((choice) => choice.ChoiceText);
        let type = rawType;
        if (!['mcq', 'input'].includes(type)) {
          type = choiceTexts.length ? 'mcq' : 'input';
        }

        const normalized = {
          type,
          text: question.QuestionText,
          points: Number.isFinite(question.Points) ? question.Points : 1
        };

        if (type === 'mcq') {
          normalized.choices = choiceTexts;
          normalized.correctIndex =
            typeof question.CorrectIndex === 'number' ? question.CorrectIndex : 0;
        } else {
          normalized.answer = question.Answer ?? '';
        }

        return normalized;
      })
    }));

    res.json({
      week: weekData.Week,
      title: weekData.Title,
      goals,
      prerequisites,
      concepts: normalizedConcepts,
      assessment: normalizedAssessments[0] || null
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal server error.'
  });
});

module.exports = app;
