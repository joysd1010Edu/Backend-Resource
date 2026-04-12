/* ==========  backend/src/services/teacherService.js  ===============*/
const mongoose = require("mongoose");

const {
  Test,
  TestSlot,
  TestQuestionSet,
  Question,
  QuestionOption,
  AttemptAnswer,
  TestCandidate,
  TestAttempt,
  TestResult,
  User,
  ActivityLog,
} = require("../models");
const ApiError = require("../utils/apiError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { upsertAttemptResult } = require("./resultService");
const {
  QUESTION_TYPES,
  QUESTION_TYPE_MODES,
  TEST_STATUS,
  ATTENDANCE_STATUS,
} = require("../utils/enums");

/* ==========  Function escapeRegex contains reusable module logic used by this feature.  ===============*/
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ==========  Function assertAllowedRole validates input and access before the next logic runs.  ===============*/
function assertAllowedRole(user) {
  if (!user || !["teacher", "admin"].includes(user.role)) {
    throw new ApiError(403, "Only teacher or admin can perform this action");
  }
}

/* ==========  Function getManagedTest gets get managed test data for the current module flow.  ===============*/
async function getManagedTest(testId, user, options = {}) {
  assertAllowedRole(user);

  const query = Test.findById(testId);
  if (options.lean !== false) {
    query.lean();
  }

  const test = await query;

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  const isOwner = String(test.created_by) === String(user._id);
  const canManage = user.role === "admin" || isOwner;

  if (!canManage) {
    throw new ApiError(403, "You can manage only your own tests");
  }

  return test;
}

/* ==========  Function logActivity contains reusable module logic used by this feature.  ===============*/
async function logActivity(
  userId,
  entityType,
  entityId,
  action,
  description,
  metadata,
) {
  await ActivityLog.create({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    metadata,
  });
}

/* ==========  Function normalizeOptionInput builds helper output used by other functions in this file.  ===============*/
function normalizeOptionInput(options = []) {
  return options.map((option, index) => ({
    option_key: String(option.option_key || "")
      .trim()
      .toUpperCase(),
    option_text_html: String(option.option_text_html || "").trim(),
    plain_text: option.plain_text ? String(option.plain_text) : "",
    is_correct: Boolean(option.is_correct),
    sort_order: Number(option.sort_order || index + 1),
  }));
}

/* ==========  Function assertQuestionOptionRules validates input and access before the next logic runs.  ===============*/
function assertQuestionOptionRules(questionType, options) {
  if (!QUESTION_TYPES.includes(questionType)) {
    throw new ApiError(400, "Invalid question_type");
  }

  if (questionType === "text") {
    if (Array.isArray(options) && options.length > 0) {
      throw new ApiError(400, "Text questions cannot have options");
    }

    return;
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new ApiError(
      400,
      "Options are required for radio and checkbox questions",
    );
  }

  const uniqueOptionKeys = new Set();
  const uniqueSortOrder = new Set();

  for (const option of options) {
    if (!option.option_key || !option.option_text_html) {
      throw new ApiError(
        400,
        "Each option must have option_key and option_text_html",
      );
    }

    if (uniqueOptionKeys.has(option.option_key)) {
      throw new ApiError(400, "option_key must be unique per question");
    }

    if (uniqueSortOrder.has(option.sort_order)) {
      throw new ApiError(400, "sort_order must be unique per question");
    }

    uniqueOptionKeys.add(option.option_key);
    uniqueSortOrder.add(option.sort_order);
  }

  const correctCount = options.filter((option) => option.is_correct).length;

  if (questionType === "radio" && correctCount !== 1) {
    throw new ApiError(
      400,
      "Radio questions must have exactly 1 correct option",
    );
  }

  if (questionType === "checkbox" && correctCount < 1) {
    throw new ApiError(
      400,
      "Checkbox questions must have at least 1 correct option",
    );
  }
}

/* ==========  Function refreshQuestionSetStats contains reusable module logic used by this feature.  ===============*/
async function refreshQuestionSetStats(questionSetId) {
  const setObjectId = new mongoose.Types.ObjectId(String(questionSetId));

  const [stats] = await Question.aggregate([
    {
      $match: {
        question_set_id: setObjectId,
        status: { $ne: "deleted" },
      },
    },
    {
      $group: {
        _id: null,
        total_questions: { $sum: 1 },
        total_marks: { $sum: "$score" },
      },
    },
  ]);

  await TestQuestionSet.findByIdAndUpdate(questionSetId, {
    total_questions: stats?.total_questions || 0,
    total_marks: stats?.total_marks || 0,
  });
}

/* ==========  Function refreshTestCounters contains reusable module logic used by this feature.  ===============*/
async function refreshTestCounters(testId) {
  const [totalSlots, totalQuestionSets, totalCandidates] = await Promise.all([
    TestSlot.countDocuments({ test_id: testId }),
    TestQuestionSet.countDocuments({ test_id: testId }),
    TestCandidate.countDocuments({ test_id: testId }),
  ]);

  await Test.findByIdAndUpdate(testId, {
    total_slots: totalSlots,
    total_question_set: totalQuestionSets,
    total_candidates: totalCandidates,
    question_set_completed: totalQuestionSets > 0,
  });
}

/* ==========  Function getSortOptions gets get sort options data for the current module flow.  ===============*/
function getSortOptions(sortBy, sortOrder) {
  const allowedSortBy = new Set([
    "created_at",
    "updated_at",
    "title",
    "start_time",
    "status",
  ]);
  const field = allowedSortBy.has(sortBy) ? sortBy : "created_at";
  const order = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;

  return { [field]: order };
}

/* ==========  Function createTest creates create test data used by this module.  ===============*/
async function createTest(payload, user) {
  assertAllowedRole(user);

  const requestedAudience =
    payload.total_candidates ?? payload.total_audience ?? 0;
  const totalCandidates = Number(requestedAudience);
  const requestedTotalSlots = Number(payload.total_slots ?? 1);
  const requestedTotalQuestionSets = Number(payload.total_question_set ?? 1);

  const test = await Test.create({
    title: payload.title,
    created_by: user._id,
    start_time: payload.start_time,
    end_time: payload.end_time,
    duration_minutes: payload.duration_minutes,
    total_candidates:
      Number.isFinite(totalCandidates) && totalCandidates >= 0
        ? totalCandidates
        : 0,
    total_slots:
      Number.isInteger(requestedTotalSlots) && requestedTotalSlots >= 1
        ? requestedTotalSlots
        : 1,
    total_question_set:
      Number.isInteger(requestedTotalQuestionSets) &&
      requestedTotalQuestionSets >= 1
        ? requestedTotalQuestionSets
        : 1,
    question_type_mode: payload.question_type_mode || "mixed",
    negative_marking_enabled: Boolean(payload.negative_marking_enabled),
    negative_mark_per_wrong: payload.negative_mark_per_wrong || 0,
    status: payload.status || "draft",
    basic_info_completed: true,
    question_set_completed: false,
    instructions: payload.instructions || "",
    show_result_to_student:
      payload.show_result_to_student !== undefined
        ? Boolean(payload.show_result_to_student)
        : true,
    randomize_question_order: Boolean(payload.randomize_question_order),
    randomize_option_order: Boolean(payload.randomize_option_order),
  });

  await logActivity(
    user._id,
    "Test",
    test._id,
    "test_created",
    "Teacher created a test",
    { test_id: String(test._id), title: test.title },
  );

  return test;
}

/* ==========  Function listTests gets list tests data for the current module flow.  ===============*/
async function listTests(query, user) {
  assertAllowedRole(user);

  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const filter = {};

  if (user.role === "teacher") {
    filter.created_by = user._id;
  }

  if (query.status && TEST_STATUS.includes(query.status)) {
    filter.status = query.status;
  }

  if (query.search) {
    filter.title = {
      $regex: escapeRegex(String(query.search).trim()),
      $options: "i",
    };
  }

  const sort = getSortOptions(query.sort_by, query.sort_order);

  const [tests, total] = await Promise.all([
    Test.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Test.countDocuments(filter),
  ]);

  return {
    items: tests,
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

/* ==========  Function getTestDetails gets get test details data for the current module flow.  ===============*/
async function getTestDetails(testId, user) {
  const test = await getManagedTest(testId, user);

  const [slotCount, questionSetCount, questionCount] = await Promise.all([
    TestSlot.countDocuments({ test_id: test._id }),
    TestQuestionSet.countDocuments({ test_id: test._id }),
    Question.countDocuments({ test_id: test._id, status: { $ne: "deleted" } }),
  ]);

  return {
    ...test,
    counts: {
      total_slots: slotCount,
      total_question_sets: questionSetCount,
      total_questions: questionCount,
    },
  };
}

/* ==========  Function updateTest updates update test values for this workflow.  ===============*/
async function updateTest(testId, payload, user) {
  await getManagedTest(testId, user);

  const allowedFields = [
    "title",
    "start_time",
    "end_time",
    "duration_minutes",
    "question_type_mode",
    "negative_marking_enabled",
    "negative_mark_per_wrong",
    "status",
    "instructions",
    "show_result_to_student",
    "randomize_question_order",
    "randomize_option_order",
    "basic_info_completed",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = payload[field];
    }
  }

  const test = await Test.findByIdAndUpdate(testId, updates, {
    new: true,
    runValidators: true,
  });

  await logActivity(
    user._id,
    "Test",
    test._id,
    "test_updated",
    "Teacher updated test basic info",
    { test_id: String(test._id), updated_fields: Object.keys(updates) },
  );

  return test;
}

/* ==========  Function createTestSlot creates create test slot data used by this module.  ===============*/
async function createTestSlot(testId, payload, user) {
  const test = await getManagedTest(testId, user);

  let slotNo = payload.slot_no;
  if (!slotNo) {
    const [last] = await TestSlot.find({ test_id: test._id })
      .sort({ slot_no: -1 })
      .limit(1)
      .lean();

    slotNo = (last?.slot_no || 0) + 1;
  }

  const slot = await TestSlot.create({
    test_id: test._id,
    slot_no: slotNo,
    start_time: payload.start_time,
    end_time: payload.end_time,
    duration_minutes: payload.duration_minutes,
    candidate_limit: payload.candidate_limit || 0,
    status: payload.status || "active",
  });

  await refreshTestCounters(test._id);

  return slot;
}

/* ==========  Function createQuestionSet creates create question set data used by this module.  ===============*/
async function createQuestionSet(testId, payload, user) {
  const test = await getManagedTest(testId, user);

  let setNo = payload.set_no;
  if (!setNo) {
    const [last] = await TestQuestionSet.find({ test_id: test._id })
      .sort({ set_no: -1 })
      .limit(1)
      .lean();

    setNo = (last?.set_no || 0) + 1;
  }

  const questionSet = await TestQuestionSet.create({
    test_id: test._id,
    set_name: payload.set_name,
    set_no: setNo,
    status: payload.status || "active",
  });

  await refreshTestCounters(test._id);

  return questionSet;
}

/* ==========  Function createQuestion creates create question data used by this module.  ===============*/
async function createQuestion(testId, payload, user) {
  const test = await getManagedTest(testId, user);

  const questionSet = await TestQuestionSet.findOne({
    _id: payload.question_set_id,
    test_id: test._id,
  }).lean();

  if (!questionSet) {
    throw new ApiError(400, "question_set_id does not belong to this test");
  }

  const options = normalizeOptionInput(payload.options || []);
  assertQuestionOptionRules(payload.question_type, options);

  let questionNo = payload.question_no;
  if (!questionNo) {
    const [last] = await Question.find({ question_set_id: questionSet._id })
      .sort({ question_no: -1 })
      .limit(1)
      .lean();

    questionNo = (last?.question_no || 0) + 1;
  }

  const question = await Question.create({
    test_id: test._id,
    question_set_id: questionSet._id,
    question_no: questionNo,
    question_type: payload.question_type,
    title_html: payload.title_html,
    plain_text: payload.plain_text || "",
    score: payload.score ?? 1,
    negative_mark: payload.negative_mark ?? 0,
    correct_text_answer: payload.correct_text_answer ?? null,
    explanation: payload.explanation ?? null,
    is_required:
      payload.is_required !== undefined ? Boolean(payload.is_required) : true,
    status: "active",
    created_by: user._id,
  });

  if (options.length > 0) {
    await QuestionOption.insertMany(
      options.map((option) => ({
        ...option,
        question_id: question._id,
      })),
    );
  }

  await refreshQuestionSetStats(questionSet._id);

  await logActivity(
    user._id,
    "Question",
    question._id,
    "question_added",
    "Teacher added a question",
    {
      test_id: String(test._id),
      question_set_id: String(questionSet._id),
      question_type: question.question_type,
    },
  );

  const createdQuestion = await Question.findById(question._id).lean();
  const createdOptions = await QuestionOption.find({
    question_id: question._id,
  })
    .sort({ sort_order: 1 })
    .lean();

  return {
    ...createdQuestion,
    options: createdOptions,
  };
}

/* ==========  Function updateQuestion updates update question values for this workflow.  ===============*/
async function updateQuestion(questionId, payload, user) {
  const question = await Question.findById(questionId);

  if (!question || question.status === "deleted") {
    throw new ApiError(404, "Question not found");
  }

  await getManagedTest(question.test_id, user);

  if (payload.question_set_id) {
    const questionSet = await TestQuestionSet.findOne({
      _id: payload.question_set_id,
      test_id: question.test_id,
    }).lean();

    if (!questionSet) {
      throw new ApiError(400, "question_set_id does not belong to this test");
    }
  }

  const patchableFields = [
    "question_set_id",
    "question_no",
    "question_type",
    "title_html",
    "plain_text",
    "score",
    "negative_mark",
    "correct_text_answer",
    "explanation",
    "is_required",
    "status",
  ];

  for (const field of patchableFields) {
    if (payload[field] !== undefined) {
      question[field] = payload[field];
    }
  }

  if (question.question_type === "text") {
    await QuestionOption.deleteMany({ question_id: question._id });
  } else {
    if (Array.isArray(payload.options)) {
      const normalized = normalizeOptionInput(payload.options);
      assertQuestionOptionRules(question.question_type, normalized);
      await QuestionOption.deleteMany({ question_id: question._id });
      await QuestionOption.insertMany(
        normalized.map((option) => ({
          ...option,
          question_id: question._id,
        })),
      );
    }

    const currentOptions = await QuestionOption.find({
      question_id: question._id,
    }).lean();
    assertQuestionOptionRules(
      question.question_type,
      currentOptions.map((option) => ({
        option_key: option.option_key,
        option_text_html: option.option_text_html,
        plain_text: option.plain_text,
        is_correct: option.is_correct,
        sort_order: option.sort_order,
      })),
    );
  }

  await question.save();
  await refreshQuestionSetStats(question.question_set_id);

  await logActivity(
    user._id,
    "Question",
    question._id,
    "question_edited",
    "Teacher edited a question",
    { question_id: String(question._id), test_id: String(question.test_id) },
  );

  const updatedQuestion = await Question.findById(question._id).lean();
  const options = await QuestionOption.find({ question_id: question._id })
    .sort({ sort_order: 1 })
    .lean();

  return {
    ...updatedQuestion,
    options,
  };
}

/* ==========  Function removeQuestion removes remove question related data in this module.  ===============*/
async function removeQuestion(questionId, user) {
  const question = await Question.findById(questionId);

  if (!question || question.status === "deleted") {
    throw new ApiError(404, "Question not found");
  }

  await getManagedTest(question.test_id, user);

  question.status = "deleted";
  await question.save();

  await refreshQuestionSetStats(question.question_set_id);

  await logActivity(
    user._id,
    "Question",
    question._id,
    "question_removed",
    "Teacher removed a question",
    { question_id: String(question._id), test_id: String(question.test_id) },
  );

  return question;
}

/* ==========  Function listQuestions gets list questions data for the current module flow.  ===============*/
async function listQuestions(testId, query, user) {
  const test = await getManagedTest(testId, user);
  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const filter = {
    test_id: test._id,
  };

  if (query.question_set_id) {
    filter.question_set_id = query.question_set_id;
  }

  if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = { $ne: "deleted" };
  }

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .sort({ question_no: 1, created_at: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Question.countDocuments(filter),
  ]);

  const questionIds = questions.map((item) => item._id);
  const options = await QuestionOption.find({
    question_id: { $in: questionIds },
  })
    .sort({ sort_order: 1 })
    .lean();

  const optionsByQuestion = new Map();
  for (const option of options) {
    const key = String(option.question_id);
    if (!optionsByQuestion.has(key)) {
      optionsByQuestion.set(key, []);
    }

    optionsByQuestion.get(key).push(option);
  }

  return {
    items: questions.map((question) => ({
      ...question,
      options: optionsByQuestion.get(String(question._id)) || [],
    })),
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

/* ==========  Function addQuestionOptions creates add question options data used by this module.  ===============*/
async function addQuestionOptions(questionId, payload, user) {
  const question = await Question.findById(questionId);

  if (!question || question.status === "deleted") {
    throw new ApiError(404, "Question not found");
  }

  await getManagedTest(question.test_id, user);

  if (question.question_type === "text") {
    throw new ApiError(400, "Text questions cannot have options");
  }

  const incoming = normalizeOptionInput(payload.options || []);
  const existing = await QuestionOption.find({
    question_id: question._id,
  }).lean();

  const combined = [
    ...existing.map((option) => ({
      option_key: option.option_key,
      option_text_html: option.option_text_html,
      plain_text: option.plain_text,
      is_correct: option.is_correct,
      sort_order: option.sort_order,
    })),
    ...incoming,
  ];

  assertQuestionOptionRules(question.question_type, combined);

  await QuestionOption.insertMany(
    incoming.map((option) => ({
      ...option,
      question_id: question._id,
    })),
  );

  const options = await QuestionOption.find({ question_id: question._id })
    .sort({ sort_order: 1 })
    .lean();

  return {
    question_id: String(question._id),
    options,
  };
}

/* ==========  Function updateQuestionOption updates update question option values for this workflow.  ===============*/
async function updateQuestionOption(questionId, optionId, payload, user) {
  const question = await Question.findById(questionId);

  if (!question || question.status === "deleted") {
    throw new ApiError(404, "Question not found");
  }

  await getManagedTest(question.test_id, user);

  if (question.question_type === "text") {
    throw new ApiError(400, "Text questions do not support options");
  }

  const option = await QuestionOption.findOne({
    _id: optionId,
    question_id: question._id,
  });

  if (!option) {
    throw new ApiError(404, "Option not found");
  }

  if (payload.option_key !== undefined) {
    option.option_key = String(payload.option_key).trim().toUpperCase();
  }

  if (payload.option_text_html !== undefined) {
    option.option_text_html = String(payload.option_text_html);
  }

  if (payload.plain_text !== undefined) {
    option.plain_text = payload.plain_text ? String(payload.plain_text) : "";
  }

  if (payload.is_correct !== undefined) {
    option.is_correct = Boolean(payload.is_correct);
  }

  if (payload.sort_order !== undefined) {
    option.sort_order = Number(payload.sort_order);
  }

  const existingOptions = await QuestionOption.find({
    question_id: question._id,
  }).lean();
  const mergedOptions = existingOptions.map((item) => {
    if (String(item._id) !== String(option._id)) {
      return {
        option_key: item.option_key,
        option_text_html: item.option_text_html,
        plain_text: item.plain_text,
        is_correct: item.is_correct,
        sort_order: item.sort_order,
      };
    }

    return {
      option_key: option.option_key,
      option_text_html: option.option_text_html,
      plain_text: option.plain_text,
      is_correct: option.is_correct,
      sort_order: option.sort_order,
    };
  });

  assertQuestionOptionRules(question.question_type, mergedOptions);

  await option.save();

  return option;
}

/* ==========  Function assignCandidates contains reusable module logic used by this feature.  ===============*/
async function assignCandidates(testId, payload, user) {
  const test = await getManagedTest(testId, user);

  const studentIds = Array.from(
    new Set((payload.student_ids || []).map((id) => String(id))),
  );

  if (studentIds.length === 0) {
    throw new ApiError(400, "student_ids must contain at least one student id");
  }

  const [slot, questionSet, students] = await Promise.all([
    TestSlot.findOne({ _id: payload.slot_id, test_id: test._id }).lean(),
    TestQuestionSet.findOne({
      _id: payload.question_set_id,
      test_id: test._id,
    }).lean(),
    User.find({
      _id: { $in: studentIds },
      role: "student",
    })
      .select("_id role status")
      .lean(),
  ]);

  if (!slot) {
    throw new ApiError(400, "slot_id does not belong to this test");
  }

  if (!questionSet) {
    throw new ApiError(400, "question_set_id does not belong to this test");
  }

  if (students.length !== studentIds.length) {
    throw new ApiError(
      400,
      "One or more students are invalid or not student role",
    );
  }

  const existingCandidates = await TestCandidate.find({
    test_id: test._id,
    student_id: { $in: studentIds },
  })
    .select("_id student_id slot_id")
    .lean();

  const existingByStudent = new Map(
    existingCandidates.map((item) => [String(item.student_id), item]),
  );

  const currentSlotCount = await TestCandidate.countDocuments({
    test_id: test._id,
    slot_id: slot._id,
  });

  const addToThisSlotCount = studentIds.filter((studentId) => {
    const existing = existingByStudent.get(studentId);
    if (!existing) {
      return true;
    }

    return String(existing.slot_id) !== String(slot._id);
  }).length;

  if (
    slot.candidate_limit > 0 &&
    currentSlotCount + addToThisSlotCount > slot.candidate_limit
  ) {
    throw new ApiError(400, "Candidate limit exceeded for this slot");
  }

  const maxSerialDoc = await TestCandidate.findOne({ test_id: test._id })
    .sort({ candidate_serial: -1 })
    .select("candidate_serial")
    .lean();

  let serialCursor = maxSerialDoc?.candidate_serial || 0;
  let assignedCount = 0;
  let updatedCount = 0;

  const operations = studentIds.map((studentId) => {
    const existing = existingByStudent.get(studentId);

    if (existing) {
      updatedCount += 1;
      return {
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              slot_id: slot._id,
              question_set_id: questionSet._id,
              is_eligible: true,
              assigned_at: new Date(),
            },
          },
        },
      };
    }

    serialCursor += 1;
    assignedCount += 1;

    return {
      insertOne: {
        document: {
          test_id: test._id,
          student_id: studentId,
          slot_id: slot._id,
          question_set_id: questionSet._id,
          candidate_serial: serialCursor,
          attendance_status: "not_started",
          is_eligible: true,
          assigned_at: new Date(),
        },
      },
    };
  });

  if (operations.length > 0) {
    await TestCandidate.bulkWrite(operations, { ordered: false });
  }

  await refreshTestCounters(test._id);

  await logActivity(
    user._id,
    "Test",
    test._id,
    "candidates_assigned",
    "Teacher assigned candidates to test",
    {
      test_id: String(test._id),
      slot_id: String(slot._id),
      question_set_id: String(questionSet._id),
      total_received: studentIds.length,
      assigned_count: assignedCount,
      updated_count: updatedCount,
    },
  );

  return {
    test_id: String(test._id),
    slot_id: String(slot._id),
    question_set_id: String(questionSet._id),
    total_received: studentIds.length,
    assigned_count: assignedCount,
    updated_count: updatedCount,
  };
}

/* ==========  Function listCandidates gets list candidates data for the current module flow.  ===============*/
async function listCandidates(testId, query, user) {
  const test = await getManagedTest(testId, user);
  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const filter = { test_id: test._id };

  if (
    query.attendance_status &&
    ATTENDANCE_STATUS.includes(query.attendance_status)
  ) {
    filter.attendance_status = query.attendance_status;
  }

  const [items, total] = await Promise.all([
    TestCandidate.find(filter)
      .populate("student_id", "full_name email user_id_login status")
      .populate("slot_id", "slot_no start_time end_time status")
      .populate("question_set_id", "set_name set_no status")
      .sort({ candidate_serial: 1, assigned_at: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TestCandidate.countDocuments(filter),
  ]);

  return {
    items,
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

/* ==========  Function publishTest contains reusable module logic used by this feature.  ===============*/
async function publishTest(testId, user) {
  const test = await getManagedTest(testId, user, { lean: false });

  const [slotCount, questionSetCount, activeQuestionCount] = await Promise.all([
    TestSlot.countDocuments({ test_id: test._id, status: "active" }),
    TestQuestionSet.countDocuments({ test_id: test._id, status: "active" }),
    Question.countDocuments({ test_id: test._id, status: "active" }),
  ]);

  if (slotCount < 1 || questionSetCount < 1 || activeQuestionCount < 1) {
    throw new ApiError(
      400,
      "Test cannot be published. It requires at least one active slot, question set, and question",
      {
        slots: slotCount,
        question_sets: questionSetCount,
        active_questions: activeQuestionCount,
      },
    );
  }

  test.status = "published";
  test.basic_info_completed = true;
  test.question_set_completed = true;

  await test.save();
  await refreshTestCounters(test._id);

  await logActivity(
    user._id,
    "Test",
    test._id,
    "test_published",
    "Teacher published the test",
    { test_id: String(test._id) },
  );

  return test;
}

/* ==========  Function getTeacherDashboardMetrics gets get teacher dashboard metrics data for the current module flow.  ===============*/
async function getTeacherDashboardMetrics(user) {
  assertAllowedRole(user);

  const testFilter = user.role === "teacher" ? { created_by: user._id } : {};
  const now = new Date();

  const [testStatusStats, testIds] = await Promise.all([
    Test.aggregate([
      {
        $match: testFilter,
      },
      {
        $group: {
          _id: null,
          total_exams: { $sum: 1 },
          draft_exams: {
            $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
          },
          published_exams: {
            $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
          },
          running_exams: {
            $sum: { $cond: [{ $eq: ["$status", "running"] }, 1, 0] },
          },
          completed_exams: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          archived_exams: {
            $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] },
          },
          upcoming_exams: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$start_time", now] },
                    { $in: ["$status", ["draft", "published", "running"]] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          live_exams_now: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lte: ["$start_time", now] },
                    { $gte: ["$end_time", now] },
                    { $in: ["$status", ["published", "running"]] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Test.find(testFilter).select("_id").lean(),
  ]);

  const stats = testStatusStats[0] || {};
  const managedTestIds = testIds.map((item) => item._id);

  if (managedTestIds.length === 0) {
    return {
      exam_overview: {
        total_exams: 0,
        draft_exams: 0,
        published_exams: 0,
        running_exams: 0,
        completed_exams: 0,
        archived_exams: 0,
        upcoming_exams: 0,
        live_exams_now: 0,
      },
      student_overview: {
        total_assigned_candidates: 0,
        unique_assigned_students: 0,
        attended_students: 0,
        submitted_students: 0,
        timeout_students: 0,
        absent_students: 0,
        attendance_rate: 0,
        submission_rate: 0,
      },
      attempt_overview: {
        in_progress_attempts: 0,
        completed_attempts: 0,
        auto_submitted_attempts: 0,
      },
      result_overview: {
        published_results: 0,
        average_marks: 0,
        highest_marks: 0,
        lowest_marks: 0,
        average_percentage: 0,
        pass_count: 0,
        fail_count: 0,
      },
      review_overview: {
        pending_text_reviews: 0,
      },
      recent_exams: [],
    };
  }

  const [
    totalAssignedCandidates,
    uniqueAssignedStudents,
    attendedStudents,
    submittedStudents,
    timeoutStudents,
    absentStudents,
    attemptStats,
    resultStats,
    pendingTextReviews,
    recentExams,
  ] = await Promise.all([
    TestCandidate.countDocuments({ test_id: { $in: managedTestIds } }),
    TestCandidate.distinct("student_id", { test_id: { $in: managedTestIds } }),
    TestCandidate.countDocuments({
      test_id: { $in: managedTestIds },
      attendance_status: { $in: ["in_progress", "submitted", "timeout"] },
    }),
    TestCandidate.countDocuments({
      test_id: { $in: managedTestIds },
      attendance_status: "submitted",
    }),
    TestCandidate.countDocuments({
      test_id: { $in: managedTestIds },
      attendance_status: "timeout",
    }),
    TestCandidate.countDocuments({
      test_id: { $in: managedTestIds },
      attendance_status: "absent",
    }),
    TestAttempt.aggregate([
      {
        $match: {
          test_id: {
            $in: managedTestIds,
          },
        },
      },
      {
        $group: {
          _id: null,
          in_progress_attempts: {
            $sum: {
              $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0],
            },
          },
          completed_attempts: {
            $sum: {
              $cond: [
                { $in: ["$status", ["submitted", "timeout", "evaluated"]] },
                1,
                0,
              ],
            },
          },
          auto_submitted_attempts: {
            $sum: {
              $cond: [{ $eq: ["$auto_submitted", true] }, 1, 0],
            },
          },
        },
      },
    ]),
    TestResult.aggregate([
      {
        $match: {
          test_id: {
            $in: managedTestIds,
          },
        },
      },
      {
        $group: {
          _id: null,
          published_results: {
            $sum: {
              $cond: [{ $eq: ["$result_status", "published"] }, 1, 0],
            },
          },
          average_marks: { $avg: "$final_marks" },
          highest_marks: { $max: "$final_marks" },
          lowest_marks: { $min: "$final_marks" },
          average_percentage: { $avg: "$percentage" },
          pass_count: {
            $sum: {
              $cond: [{ $gte: ["$percentage", 40] }, 1, 0],
            },
          },
          fail_count: {
            $sum: {
              $cond: [{ $lt: ["$percentage", 40] }, 1, 0],
            },
          },
        },
      },
    ]),
    AttemptAnswer.countDocuments({
      test_id: { $in: managedTestIds },
      question_type: "text",
      review_status: "pending_manual_review",
    }),
    Test.find({ _id: { $in: managedTestIds } })
      .select(
        "_id title status start_time end_time total_candidates updated_at",
      )
      .sort({ updated_at: -1, created_at: -1 })
      .limit(5)
      .lean(),
  ]);

  const attemptOverview = attemptStats[0] || {};
  const resultOverview = resultStats[0] || {};

  const attendanceRate =
    totalAssignedCandidates > 0
      ? (attendedStudents / totalAssignedCandidates) * 100
      : 0;
  const submissionRate =
    totalAssignedCandidates > 0
      ? ((submittedStudents + timeoutStudents) / totalAssignedCandidates) * 100
      : 0;

  return {
    exam_overview: {
      total_exams: Number(stats.total_exams || 0),
      draft_exams: Number(stats.draft_exams || 0),
      published_exams: Number(stats.published_exams || 0),
      running_exams: Number(stats.running_exams || 0),
      completed_exams: Number(stats.completed_exams || 0),
      archived_exams: Number(stats.archived_exams || 0),
      upcoming_exams: Number(stats.upcoming_exams || 0),
      live_exams_now: Number(stats.live_exams_now || 0),
    },
    student_overview: {
      total_assigned_candidates: Number(totalAssignedCandidates || 0),
      unique_assigned_students: Number(uniqueAssignedStudents.length || 0),
      attended_students: Number(attendedStudents || 0),
      submitted_students: Number(submittedStudents || 0),
      timeout_students: Number(timeoutStudents || 0),
      absent_students: Number(absentStudents || 0),
      attendance_rate: Number(attendanceRate.toFixed(2)),
      submission_rate: Number(submissionRate.toFixed(2)),
    },
    attempt_overview: {
      in_progress_attempts: Number(attemptOverview.in_progress_attempts || 0),
      completed_attempts: Number(attemptOverview.completed_attempts || 0),
      auto_submitted_attempts: Number(
        attemptOverview.auto_submitted_attempts || 0,
      ),
    },
    result_overview: {
      published_results: Number(resultOverview.published_results || 0),
      average_marks: Number(resultOverview.average_marks || 0),
      highest_marks: Number(resultOverview.highest_marks || 0),
      lowest_marks: Number(resultOverview.lowest_marks || 0),
      average_percentage: Number(resultOverview.average_percentage || 0),
      pass_count: Number(resultOverview.pass_count || 0),
      fail_count: Number(resultOverview.fail_count || 0),
    },
    review_overview: {
      pending_text_reviews: Number(pendingTextReviews || 0),
    },
    recent_exams: recentExams,
  };
}

/* ==========  Function getTestMetrics gets get test metrics data for the current module flow.  ===============*/
async function getTestMetrics(testId, user) {
  const test = await getManagedTest(testId, user);

  const [
    totalCandidates,
    startedCount,
    submittedCount,
    timeoutCount,
    absentCount,
    totalQuestions,
    totalQuestionSets,
    totalSlots,
    resultStats,
  ] = await Promise.all([
    TestCandidate.countDocuments({ test_id: test._id }),
    TestCandidate.countDocuments({
      test_id: test._id,
      attendance_status: { $in: ["in_progress", "submitted", "timeout"] },
    }),
    TestCandidate.countDocuments({
      test_id: test._id,
      attendance_status: "submitted",
    }),
    TestCandidate.countDocuments({
      test_id: test._id,
      attendance_status: "timeout",
    }),
    TestCandidate.countDocuments({
      test_id: test._id,
      attendance_status: "absent",
    }),
    Question.countDocuments({ test_id: test._id, status: "active" }),
    TestQuestionSet.countDocuments({ test_id: test._id, status: "active" }),
    TestSlot.countDocuments({ test_id: test._id, status: "active" }),
    TestResult.aggregate([
      {
        $match: {
          test_id: new mongoose.Types.ObjectId(String(test._id)),
        },
      },
      {
        $group: {
          _id: null,
          average_marks: { $avg: "$final_marks" },
          highest_marks: { $max: "$final_marks" },
          lowest_marks: { $min: "$final_marks" },
          pass_count: {
            $sum: {
              $cond: [{ $gte: ["$percentage", 40] }, 1, 0],
            },
          },
          fail_count: {
            $sum: {
              $cond: [{ $lt: ["$percentage", 40] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const stats = resultStats[0] || {};

  return {
    total_candidates: totalCandidates,
    started_count: startedCount,
    submitted_count: submittedCount,
    timeout_count: timeoutCount,
    absent_count: absentCount,
    average_marks: Number(stats.average_marks || 0),
    highest_marks: Number(stats.highest_marks || 0),
    lowest_marks: Number(stats.lowest_marks || 0),
    pass_count: Number(stats.pass_count || 0),
    fail_count: Number(stats.fail_count || 0),
    total_questions: totalQuestions,
    total_question_sets: totalQuestionSets,
    total_slots: totalSlots,
  };
}

/* ==========  Function getTextAnswerReviews gets get text answer reviews data for the current module flow.  ===============*/
async function getTextAnswerReviews(testId, query, user) {
  const test = await getManagedTest(testId, user);
  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const filter = {
    test_id: test._id,
    question_type: "text",
  };

  filter.review_status = query.review_status || "pending_manual_review";

  const [items, total] = await Promise.all([
    AttemptAnswer.find(filter)
      .populate("student_id", "full_name email user_id_login")
      .populate("question_id", "question_no title_html score")
      .populate("attempt_id", "status submitted_at started_at")
      .sort({ answered_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttemptAnswer.countDocuments(filter),
  ]);

  return {
    items,
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

/* ==========  Function reviewTextAnswer contains reusable module logic used by this feature.  ===============*/
async function reviewTextAnswer(answerId, payload, user) {
  assertAllowedRole(user);

  const answer = await AttemptAnswer.findById(answerId);

  if (!answer) {
    throw new ApiError(404, "Attempt answer not found");
  }

  if (answer.question_type !== "text") {
    throw new ApiError(400, "Only text answers can be reviewed manually");
  }

  await getManagedTest(answer.test_id, user);

  const [question, attempt] = await Promise.all([
    Question.findById(answer.question_id).lean(),
    TestAttempt.findById(answer.attempt_id).lean(),
  ]);

  if (!question || question.status === "deleted") {
    throw new ApiError(400, "Question not found for this answer");
  }

  if (!attempt) {
    throw new ApiError(400, "Attempt not found for this answer");
  }

  if (attempt.status === "in_progress") {
    throw new ApiError(
      400,
      "Cannot review answer while attempt is in progress",
    );
  }

  const obtainedMarks = Number(payload.obtained_marks);
  if (!Number.isFinite(obtainedMarks) || obtainedMarks < 0) {
    throw new ApiError(400, "obtained_marks must be a non-negative number");
  }

  if (obtainedMarks > Number(question.score || 0)) {
    throw new ApiError(400, "obtained_marks cannot exceed question score");
  }

  answer.obtained_marks = obtainedMarks;
  answer.negative_marks_applied = 0;
  answer.checked_by_teacher = true;
  answer.review_status = "reviewed";
  answer.review_comment = payload.review_comment || null;
  answer.reviewed_at = new Date();

  if (payload.is_correct !== undefined) {
    answer.is_correct = Boolean(payload.is_correct);
  } else if (obtainedMarks === Number(question.score || 0)) {
    answer.is_correct = true;
  } else if (obtainedMarks === 0) {
    answer.is_correct = false;
  } else {
    answer.is_correct = null;
  }

  await answer.save();

  const recalculation = await upsertAttemptResult(attempt._id, {
    status: attempt.status,
    autoSubmitted: attempt.auto_submitted,
    submittedAt: attempt.submitted_at || new Date(),
  });

  await logActivity(
    user._id,
    "AttemptAnswer",
    answer._id,
    "text_answer_reviewed",
    "Teacher reviewed a text answer",
    {
      test_id: String(answer.test_id),
      attempt_id: String(answer.attempt_id),
      answer_id: String(answer._id),
      obtained_marks: obtainedMarks,
    },
  );

  const reviewedAnswer = await AttemptAnswer.findById(answer._id)
    .populate("student_id", "full_name email user_id_login")
    .populate("question_id", "question_no title_html score")
    .lean();

  return {
    answer: reviewedAnswer,
    attempt: recalculation.attempt,
    result: recalculation.result,
  };
}

module.exports = {
  createTest,
  listTests,
  getTeacherDashboardMetrics,
  getTestDetails,
  updateTest,
  createTestSlot,
  createQuestionSet,
  createQuestion,
  updateQuestion,
  removeQuestion,
  listQuestions,
  addQuestionOptions,
  updateQuestionOption,
  assignCandidates,
  listCandidates,
  publishTest,
  getTestMetrics,
  getTextAnswerReviews,
  reviewTextAnswer,
};
