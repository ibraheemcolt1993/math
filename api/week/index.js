const { getPool, sql } = require('../_shared/db');
const { DEFAULT_HEADERS } = require('../_shared/http');

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
          hints: Array.isArray(parsed.hints) ? parsed.hints.filter(Boolean) : [],
          answer: parsed.answer ?? '',
          correctIndex: typeof parsed.correctIndex === 'number' ? parsed.correctIndex : 0,
          validation: parsed.validation && typeof parsed.validation === 'object' ? parsed.validation : null
        };
      }
    } catch (error) {
      return trimmed;
    }
  }
  return trimmed;
}

module.exports = async function (context, req) {
  try {
    const weekParam = Number(req.params.week);
    if (!Number.isInteger(weekParam)) {
      context.res = {
        status: 400,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Invalid week parameter.' }
      };
      return;
    }

    const dbPool = await getPool();

    if (req.method !== 'GET') {
      context.res = {
        status: 405,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Method not allowed.' }
      };
      return;
    }

    const weekResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT Week, Title FROM dbo.Weeks WHERE Week = @week AND IsDeleted = 0');

    if (!weekResult.recordset.length) {
      context.res = {
        status: 404,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Week not found.' }
      };
      return;
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
          flowItemId: item.FlowItemId,
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

    context.res = {
      status: 200,
      headers: DEFAULT_HEADERS,
      body: {
        week: weekData.Week,
        title: weekData.Title,
        goals,
        prerequisites,
        concepts: normalizedConcepts,
        assessment: normalizedAssessments[0] || null
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: DEFAULT_HEADERS,
      body: { ok: false, error: error.message }
    };
  }
};
