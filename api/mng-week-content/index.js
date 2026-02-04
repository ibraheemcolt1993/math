const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, notFound, methodNotAllowed, response } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toBlankAnswer(value) {
  if (value && typeof value === 'object') {
    return toCleanString(value.answer ?? value.text ?? value.value ?? '');
  }
  return toCleanString(value);
}

function toNullableString(value) {
  const cleaned = toCleanString(value);
  return cleaned ? cleaned : null;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return null;
  }
}

function normalizeHints(value) {
  if (!Array.isArray(value)) return [];
  return value.map((hint) => toCleanString(hint)).filter(Boolean).slice(0, 3);
}

function toNullableJson(value) {
  if (!value || typeof value !== 'object') return null;
  const keys = Array.isArray(value) ? value : Object.keys(value);
  if (!keys.length) return null;
  return JSON.stringify(value);
}

function buildFlowData(flowItem) {
  const data = {};
  if (Array.isArray(flowItem.items)) {
    data.items = flowItem.items.map((entry) => toCleanString(entry)).filter(Boolean);
  }
  if (Array.isArray(flowItem.blanks)) {
    data.blanks = flowItem.blanks.map((entry) => toBlankAnswer(entry)).filter(Boolean);
  }
  if (Array.isArray(flowItem.pairs)) {
    data.pairs = flowItem.pairs
      .map((pair) => ({
        left: toCleanString(pair?.left),
        right: toCleanString(pair?.right)
      }))
      .filter((pair) => pair.left || pair.right);
  }
  return data;
}

function buildQuestionData(question) {
  const data = {};
  if (Array.isArray(question.items)) {
    data.items = question.items.map((entry) => toCleanString(entry)).filter(Boolean);
  }
  if (Array.isArray(question.blanks)) {
    data.blanks = question.blanks.map((entry) => toBlankAnswer(entry)).filter(Boolean);
  }
  if (Array.isArray(question.pairs)) {
    data.pairs = question.pairs
      .map((pair) => ({
        left: toCleanString(pair?.left),
        right: toCleanString(pair?.right)
      }))
      .filter((pair) => pair.left || pair.right);
  }
  return data;
}

function parsePrereqItem(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.text) {
        return {
          type: parsed.type === 'mcq' ? 'mcq' : 'input',
          text: String(parsed.text),
          choices: Array.isArray(parsed.choices) ? parsed.choices : [],
          isRequired: parsed.isRequired !== false,
          hints: normalizeHints(parsed.hints),
          answer: parsed.answer ?? '',
          correctIndex:
            typeof parsed.correctIndex === 'number' ? parsed.correctIndex : 0,
          validation: parsed.validation && typeof parsed.validation === 'object' ? parsed.validation : null
        };
      }
    } catch (error) {
      return trimmed;
    }
  }
  return trimmed;
}

function serializePrereqItem(item) {
  if (typeof item === 'string') return toCleanString(item);
  if (item && typeof item === 'object') {
    const text = toCleanString(item.text || item.question || '');
    if (!text) return '';
    const payload = {
      type: item.type === 'mcq' ? 'mcq' : 'input',
      text,
      choices: Array.isArray(item.choices)
        ? item.choices.map((choice) => toCleanString(choice)).filter(Boolean)
        : [],
      isRequired: item.isRequired !== false,
      hints: normalizeHints(item.hints),
      validation:
        item.validation && typeof item.validation === 'object' ? item.validation : null
    };
    if (payload.type === 'mcq') {
      payload.correctIndex = toNullableInt(item.correctIndex) ?? 0;
    } else {
      payload.answer = toCleanString(item.answer || '');
    }
    return JSON.stringify(payload);
  }
  return '';
}

async function fetchWeekContent(dbPool, weekParam) {
  const weekResult = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query('SELECT Week, Title, Seq FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0');

  if (!weekResult.recordset.length) {
    return null;
  }

  const goalsResult = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query(
      'SELECT GoalId, Week, SortOrder, GoalText FROM dbo.WeekGoals WHERE Week = @week ORDER BY SortOrder'
    );

  const prerequisitesResult = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query(
      'SELECT PrerequisiteId, Week, SortOrder, PrerequisiteText FROM dbo.WeekPrerequisites WHERE Week = @week ORDER BY SortOrder'
    );

  const conceptsResult = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query('SELECT ConceptId, Week, SortOrder, Title FROM dbo.Concepts WHERE Week = @week ORDER BY SortOrder');

  const conceptIds = conceptsResult.recordset.map((concept) => concept.ConceptId);
  let flowItemsResult = { recordset: [] };
  let flowDetailsResult = { recordset: [] };
  let flowHintsResult = { recordset: [] };
  let flowChoicesResult = { recordset: [] };

  if (conceptIds.length) {
    const inClause = conceptIds.map((_, index) => `@concept${index}`).join(',');
    const flowRequest = dbPool.request();
    conceptIds.forEach((id, index) => {
      flowRequest.input(`concept${index}`, sql.Int, id);
    });

    flowItemsResult = await flowRequest.query(
      `SELECT FlowItemId, ConceptId, SortOrder, ItemType, ItemText, ItemTitle, ItemDescription, ItemUrl, Answer, CorrectIndex, Solution,
              IsRequired, DataJson, ValidationJson
       FROM dbo.FlowItems
       WHERE ConceptId IN (${inClause})
       ORDER BY ConceptId, SortOrder`
    );

    const flowItemIds = flowItemsResult.recordset.map((item) => item.FlowItemId);
    if (flowItemIds.length) {
      const itemClause = flowItemIds.map((_, index) => `@item${index}`).join(',');
      const detailRequest = dbPool.request();
      flowItemIds.forEach((id, index) => {
        detailRequest.input(`item${index}`, sql.Int, id);
      });

      flowDetailsResult = await detailRequest.query(
        `SELECT FlowItemDetailId, FlowItemId, SortOrder, DetailText
         FROM dbo.FlowItemDetails
         WHERE FlowItemId IN (${itemClause})
         ORDER BY FlowItemId, SortOrder`
      );

      const hintRequest = dbPool.request();
      flowItemIds.forEach((id, index) => {
        hintRequest.input(`item${index}`, sql.Int, id);
      });

      flowHintsResult = await hintRequest.query(
        `SELECT FlowItemHintId, FlowItemId, SortOrder, HintText
         FROM dbo.FlowItemHints
         WHERE FlowItemId IN (${itemClause})
         ORDER BY FlowItemId, SortOrder`
      );

      const choiceRequest = dbPool.request();
      flowItemIds.forEach((id, index) => {
        choiceRequest.input(`item${index}`, sql.Int, id);
      });

      flowChoicesResult = await choiceRequest.query(
        `SELECT FlowItemChoiceId, FlowItemId, SortOrder, ChoiceText
         FROM dbo.FlowItemChoices
         WHERE FlowItemId IN (${itemClause})
         ORDER BY FlowItemId, SortOrder`
      );
    }
  }

  const assessmentsResult = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query(
      'SELECT AssessmentId, Week, Title, Description FROM dbo.Assessments WHERE Week = @week ORDER BY AssessmentId'
    );

  const assessmentIds = assessmentsResult.recordset.map(
    (assessment) => assessment.AssessmentId
  );
  let assessmentQuestionsResult = { recordset: [] };
  let assessmentChoicesResult = { recordset: [] };

  if (assessmentIds.length) {
    const assessmentClause = assessmentIds.map((_, index) => `@assessment${index}`).join(',');
    const assessmentRequest = dbPool.request();
    assessmentIds.forEach((id, index) => {
      assessmentRequest.input(`assessment${index}`, sql.Int, id);
    });

    assessmentQuestionsResult = await assessmentRequest.query(
      `SELECT AssessmentQuestionId, AssessmentId, SortOrder, QuestionType, QuestionText, Answer, Points, CorrectIndex,
              IsRequired, DataJson, ValidationJson
       FROM dbo.AssessmentQuestions
       WHERE AssessmentId IN (${assessmentClause})
       ORDER BY AssessmentId, SortOrder`
    );

    const questionIds = assessmentQuestionsResult.recordset.map(
      (question) => question.AssessmentQuestionId
    );

    if (questionIds.length) {
      const questionClause = questionIds.map((_, index) => `@question${index}`).join(',');
      const questionRequest = dbPool.request();
      questionIds.forEach((id, index) => {
        questionRequest.input(`question${index}`, sql.Int, id);
      });

      assessmentChoicesResult = await questionRequest.query(
        `SELECT AssessmentChoiceId, AssessmentQuestionId, SortOrder, ChoiceText
         FROM dbo.AssessmentQuestionChoices
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

  const concepts = conceptsResult.recordset.map((concept) => ({
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
  const prerequisites = prerequisitesResult.recordset.map(
    (prereq) => parsePrereqItem(prereq.PrerequisiteText)
  );

  const normalizedConcepts = concepts.map(({ concept, flow }) => ({
    title: concept.Title,
    flow: flow.map(({ item, details, hints, choices }) => {
      const type = String(item.ItemType || '').trim().toLowerCase();
      const dataPayload = parseJsonField(item.DataJson) || {};
      const validationPayload = parseJsonField(item.ValidationJson);
      const mapped = {
        type,
        text: item.ItemText,
        title: item.ItemTitle,
        description: item.ItemDescription,
        url: item.ItemUrl,
        answer: item.Answer,
        correctIndex: item.CorrectIndex,
        solution: item.Solution,
        isRequired: item.IsRequired !== false,
        validation: validationPayload && typeof validationPayload === 'object' ? validationPayload : null,
        details: details.map((detail) => detail.DetailText),
        hints: hints.map((hint) => hint.HintText),
        choices: choices.map((choice) => choice.ChoiceText)
      };

      if (dataPayload && typeof dataPayload === 'object') {
        Object.assign(mapped, dataPayload);
      }

      if (type === 'ordering' && !Array.isArray(mapped.items) && mapped.choices?.length) {
        mapped.items = mapped.choices;
      }

      if (!mapped.details.length) delete mapped.details;
      if (!mapped.hints.length) delete mapped.hints;
      if (!mapped.choices.length) delete mapped.choices;
      if (!mapped.validation) delete mapped.validation;

      return mapped;
    })
  }));

  const normalizedAssessments = assessments.map(({ assessment, questions }) => ({
    title: assessment.Title,
    description: assessment.Description,
    questions: questions.map(({ question, choices }) => {
      const rawType = String(question.QuestionType || '').trim().toLowerCase();
      const choiceTexts = choices.map((choice) => choice.ChoiceText);
      const dataPayload = parseJsonField(question.DataJson) || {};
      const validationPayload = parseJsonField(question.ValidationJson);
      let type = rawType;
      if (!['mcq', 'input', 'ordering', 'match', 'fillblank'].includes(type)) {
        type = choiceTexts.length ? 'mcq' : 'input';
      }

      const normalized = {
        type,
        text: question.QuestionText,
        points: Number.isFinite(question.Points) ? question.Points : 1,
        isRequired: question.IsRequired !== false,
        validation: validationPayload && typeof validationPayload === 'object' ? validationPayload : null
      };

      if (dataPayload && typeof dataPayload === 'object') {
        Object.assign(normalized, dataPayload);
      }

      if (type === 'mcq') {
        normalized.choices = choiceTexts;
        normalized.correctIndex =
          typeof question.CorrectIndex === 'number' ? question.CorrectIndex : 0;
      } else if (type === 'input') {
        normalized.answer = question.Answer ?? '';
      } else if (type === 'ordering' && !Array.isArray(normalized.items) && choiceTexts.length) {
        normalized.items = choiceTexts;
      }

      if (!normalized.validation) delete normalized.validation;

      return normalized;
    })
  }));

  return {
    week: weekData.Week,
    seq: weekData.Seq,
    title: weekData.Title,
    goals,
    prerequisites,
    concepts: normalizedConcepts,
    assessment: normalizedAssessments[0] || null
  };
}

async function handleGet(context, weekParam) {
  const dbPool = await getPool();
  const payload = await fetchWeekContent(dbPool, weekParam);

  if (!payload) {
    context.res = notFound('Week not found.');
    return;
  }

  context.res = ok(payload);
}

async function handlePut(context, req, weekParam) {
  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const dbPool = await getPool();
  const existing = await dbPool
    .request()
    .input('week', sql.Int, weekParam)
    .query('SELECT Week FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0');

  if (!existing.recordset.length) {
    context.res = notFound('Week not found.');
    return;
  }

  const goals = Array.isArray(payload.goals) ? payload.goals : [];
  const prerequisites = Array.isArray(payload.prerequisites) ? payload.prerequisites : [];
  const concepts = Array.isArray(payload.concepts) ? payload.concepts : [];
  const assessment = payload.assessment ?? null;

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input('week', sql.Int, weekParam)
      .query(
        `DELETE FROM dbo.FlowItemDetails
         WHERE FlowItemId IN (
           SELECT FlowItemId FROM dbo.FlowItems
           WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
         );
         DELETE FROM dbo.FlowItemHints
         WHERE FlowItemId IN (
           SELECT FlowItemId FROM dbo.FlowItems
           WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
         );
         DELETE FROM dbo.FlowItemChoices
         WHERE FlowItemId IN (
           SELECT FlowItemId FROM dbo.FlowItems
           WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
         );
         DELETE FROM dbo.FlowItems
         WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week);
         DELETE FROM dbo.Concepts WHERE Week = @week;
         DELETE FROM dbo.WeekGoals WHERE Week = @week;
         DELETE FROM dbo.WeekPrerequisites WHERE Week = @week;
         DELETE FROM dbo.AssessmentQuestionChoices
         WHERE AssessmentQuestionId IN (
           SELECT AssessmentQuestionId FROM dbo.AssessmentQuestions
           WHERE AssessmentId IN (SELECT AssessmentId FROM dbo.Assessments WHERE Week = @week)
         );
         DELETE FROM dbo.AssessmentQuestions
         WHERE AssessmentId IN (SELECT AssessmentId FROM dbo.Assessments WHERE Week = @week);
         DELETE FROM dbo.Assessments WHERE Week = @week;`
      );

    for (let i = 0; i < goals.length; i += 1) {
      const text = toCleanString(goals[i]);
      if (!text) continue;
      await new sql.Request(transaction)
        .input('week', sql.Int, weekParam)
        .input('sortOrder', sql.Int, i + 1)
        .input('goalText', sql.NVarChar(500), text)
        .query(
          `INSERT INTO dbo.WeekGoals (Week, SortOrder, GoalText)
           VALUES (@week, @sortOrder, @goalText);`
        );
    }

    for (let i = 0; i < prerequisites.length; i += 1) {
      const text = serializePrereqItem(prerequisites[i]);
      if (!text) continue;
      await new sql.Request(transaction)
        .input('week', sql.Int, weekParam)
        .input('sortOrder', sql.Int, i + 1)
        .input('prereqText', sql.NVarChar(500), text)
        .query(
          `INSERT INTO dbo.WeekPrerequisites (Week, SortOrder, PrerequisiteText)
           VALUES (@week, @sortOrder, @prereqText);`
        );
    }

    for (let i = 0; i < concepts.length; i += 1) {
      const concept = concepts[i] || {};
      const conceptTitle = toCleanString(concept.title);
      const conceptResult = await new sql.Request(transaction)
        .input('week', sql.Int, weekParam)
        .input('sortOrder', sql.Int, i + 1)
        .input('title', sql.NVarChar(200), conceptTitle)
        .query(
          `INSERT INTO dbo.Concepts (Week, SortOrder, Title)
           OUTPUT INSERTED.ConceptId AS ConceptId
           VALUES (@week, @sortOrder, @title);`
        );

      const conceptId = conceptResult.recordset[0]?.ConceptId;
      const flow = Array.isArray(concept.flow) ? concept.flow : [];

      for (let j = 0; j < flow.length; j += 1) {
        const flowItem = flow[j] || {};
        const type = toCleanString(flowItem.type).toLowerCase();
        const flowData = buildFlowData(flowItem);
        const flowValidation =
          flowItem.validation && typeof flowItem.validation === 'object' ? flowItem.validation : null;
        const itemResult = await new sql.Request(transaction)
          .input('conceptId', sql.Int, conceptId)
          .input('sortOrder', sql.Int, j + 1)
          .input('itemType', sql.NVarChar(50), type)
          .input('itemText', sql.NVarChar(sql.MAX), toNullableString(flowItem.text))
          .input('itemTitle', sql.NVarChar(200), toNullableString(flowItem.title))
          .input('itemDescription', sql.NVarChar(sql.MAX), toNullableString(flowItem.description))
          .input('itemUrl', sql.NVarChar(500), toNullableString(flowItem.url))
          .input('answer', sql.NVarChar(sql.MAX), toNullableString(flowItem.answer))
          .input('correctIndex', sql.Int, toNullableInt(flowItem.correctIndex))
          .input('solution', sql.NVarChar(sql.MAX), toNullableString(flowItem.solution))
          .input('isRequired', sql.Bit, flowItem.isRequired === false ? 0 : 1)
          .input('dataJson', sql.NVarChar(sql.MAX), toNullableJson(flowData))
          .input(
            'validationJson',
            sql.NVarChar(sql.MAX),
            toNullableJson(flowValidation)
          )
          .query(
            `INSERT INTO dbo.FlowItems (
               ConceptId,
               SortOrder,
               ItemType,
               ItemText,
               ItemTitle,
               ItemDescription,
               ItemUrl,
               Answer,
               CorrectIndex,
               Solution,
               IsRequired,
               DataJson,
               ValidationJson
             )
             OUTPUT INSERTED.FlowItemId AS FlowItemId
             VALUES (
               @conceptId,
               @sortOrder,
               @itemType,
               @itemText,
               @itemTitle,
               @itemDescription,
               @itemUrl,
               @answer,
               @correctIndex,
               @solution,
               @isRequired,
               @dataJson,
               @validationJson
             );`
          );

        const flowItemId = itemResult.recordset[0]?.FlowItemId;
        const details = Array.isArray(flowItem.details) ? flowItem.details : [];
        const hints = Array.isArray(flowItem.hints) ? flowItem.hints : [];
        let choices = Array.isArray(flowItem.choices) ? flowItem.choices : [];
        if (!choices.length && Array.isArray(flowItem.items)) {
          choices = flowItem.items;
        }

        for (let k = 0; k < details.length; k += 1) {
          const text = toCleanString(details[k]);
          if (!text) continue;
          await new sql.Request(transaction)
            .input('itemId', sql.Int, flowItemId)
            .input('sortOrder', sql.Int, k + 1)
            .input('detailText', sql.NVarChar(sql.MAX), text)
            .query(
              `INSERT INTO dbo.FlowItemDetails (FlowItemId, SortOrder, DetailText)
               VALUES (@itemId, @sortOrder, @detailText);`
            );
        }

        for (let k = 0; k < hints.length; k += 1) {
          const text = toCleanString(hints[k]);
          if (!text) continue;
          await new sql.Request(transaction)
            .input('itemId', sql.Int, flowItemId)
            .input('sortOrder', sql.Int, k + 1)
            .input('hintText', sql.NVarChar(sql.MAX), text)
            .query(
              `INSERT INTO dbo.FlowItemHints (FlowItemId, SortOrder, HintText)
               VALUES (@itemId, @sortOrder, @hintText);`
            );
        }

        for (let k = 0; k < choices.length; k += 1) {
          const text = toCleanString(choices[k]);
          if (!text) continue;
          await new sql.Request(transaction)
            .input('itemId', sql.Int, flowItemId)
            .input('sortOrder', sql.Int, k + 1)
            .input('choiceText', sql.NVarChar(sql.MAX), text)
            .query(
              `INSERT INTO dbo.FlowItemChoices (FlowItemId, SortOrder, ChoiceText)
               VALUES (@itemId, @sortOrder, @choiceText);`
            );
        }
      }
    }

    if (assessment) {
      const assessmentTitle = toCleanString(assessment.title);
      const assessmentDescription = toNullableString(assessment.description);
      const assessmentResult = await new sql.Request(transaction)
        .input('week', sql.Int, weekParam)
        .input('title', sql.NVarChar(200), assessmentTitle)
        .input('description', sql.NVarChar(sql.MAX), assessmentDescription)
        .query(
          `INSERT INTO dbo.Assessments (Week, Title, Description)
           OUTPUT INSERTED.AssessmentId AS AssessmentId
           VALUES (@week, @title, @description);`
        );

      const assessmentId = assessmentResult.recordset[0]?.AssessmentId;
      const questions = Array.isArray(assessment.questions) ? assessment.questions : [];

      for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i] || {};
        const questionType = toCleanString(question.type).toLowerCase() || 'input';
        const questionText = toCleanString(question.text);
        const points = toNullableInt(question.points) ?? 1;
        const answer = questionType === 'input' ? toNullableString(question.answer) : null;
        const correctIndex = questionType === 'mcq' ? toNullableInt(question.correctIndex) : null;
        const questionData = buildQuestionData(question);
        const questionValidation =
          question.validation && typeof question.validation === 'object' ? question.validation : null;

        const questionResult = await new sql.Request(transaction)
          .input('assessmentId', sql.Int, assessmentId)
          .input('sortOrder', sql.Int, i + 1)
          .input('questionType', sql.NVarChar(50), questionType)
          .input('questionText', sql.NVarChar(sql.MAX), questionText)
          .input('answer', sql.NVarChar(sql.MAX), answer)
          .input('points', sql.Int, points)
          .input('correctIndex', sql.Int, correctIndex)
          .input('isRequired', sql.Bit, question.isRequired === false ? 0 : 1)
          .input('dataJson', sql.NVarChar(sql.MAX), toNullableJson(questionData))
          .input(
            'validationJson',
            sql.NVarChar(sql.MAX),
            toNullableJson(questionValidation)
          )
          .query(
            `INSERT INTO dbo.AssessmentQuestions (
               AssessmentId,
               SortOrder,
               QuestionType,
               QuestionText,
               Answer,
               Points,
               CorrectIndex,
               IsRequired,
               DataJson,
               ValidationJson
             )
             OUTPUT INSERTED.AssessmentQuestionId AS AssessmentQuestionId
             VALUES (
               @assessmentId,
               @sortOrder,
               @questionType,
               @questionText,
               @answer,
               @points,
               @correctIndex,
               @isRequired,
               @dataJson,
               @validationJson
             );`
          );

        const questionId = questionResult.recordset[0]?.AssessmentQuestionId;
        let choices = Array.isArray(question.choices) ? question.choices : [];
        if (!choices.length && Array.isArray(question.items)) {
          choices = question.items;
        }

        for (let j = 0; j < choices.length; j += 1) {
          const text = toCleanString(choices[j]);
          if (!text) continue;
          await new sql.Request(transaction)
            .input('questionId', sql.Int, questionId)
            .input('sortOrder', sql.Int, j + 1)
            .input('choiceText', sql.NVarChar(sql.MAX), text)
            .query(
              `INSERT INTO dbo.AssessmentQuestionChoices (AssessmentQuestionId, SortOrder, ChoiceText)
               VALUES (@questionId, @sortOrder, @choiceText);`
            );
        }
      }
    }

    await transaction.commit();
    context.res = ok({ ok: true });
  } catch (error) {
    await transaction.rollback();
    context.log('mng-week-content update failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
}

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  const weekParam = Number(req.params.week);
  if (!Number.isInteger(weekParam)) {
    context.res = badRequest('Invalid week parameter.');
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        await handleGet(context, weekParam);
        return;
      case 'PUT':
        await handlePut(context, req, weekParam);
        return;
      default:
        context.res = methodNotAllowed();
    }
  } catch (error) {
    context.log('mng-week-content request failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
