const teacherService = require("../services/teacherService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

const createTest = asyncHandler(async (req, res) => {
  const test = await teacherService.createTest(req.body, req.user);
  sendSuccess(res, test, "Test created successfully", 201);
});

const getTests = asyncHandler(async (req, res) => {
  const result = await teacherService.listTests(req.query, req.user);
  sendSuccess(res, result.items, "Test list fetched", 200, result.meta);
});

const getDashboardMetrics = asyncHandler(async (req, res) => {
  const metrics = await teacherService.getTeacherDashboardMetrics(req.user);
  sendSuccess(res, metrics, "Teacher dashboard metrics fetched");
});

const getTestById = asyncHandler(async (req, res) => {
  const test = await teacherService.getTestDetails(req.params.testId, req.user);
  sendSuccess(res, test, "Test details fetched");
});

const updateTest = asyncHandler(async (req, res) => {
  const test = await teacherService.updateTest(
    req.params.testId,
    req.body,
    req.user,
  );
  sendSuccess(res, test, "Test updated successfully");
});

const createSlot = asyncHandler(async (req, res) => {
  const slot = await teacherService.createTestSlot(
    req.params.testId,
    req.body,
    req.user,
  );
  sendSuccess(res, slot, "Slot created successfully", 201);
});

const createQuestionSet = asyncHandler(async (req, res) => {
  const set = await teacherService.createQuestionSet(
    req.params.testId,
    req.body,
    req.user,
  );
  sendSuccess(res, set, "Question set created successfully", 201);
});

const createQuestion = asyncHandler(async (req, res) => {
  const question = await teacherService.createQuestion(
    req.params.testId,
    req.body,
    req.user,
  );
  sendSuccess(res, question, "Question created successfully", 201);
});

const updateQuestion = asyncHandler(async (req, res) => {
  const question = await teacherService.updateQuestion(
    req.params.questionId,
    req.body,
    req.user,
  );

  sendSuccess(res, question, "Question updated successfully");
});

const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await teacherService.removeQuestion(
    req.params.questionId,
    req.user,
  );
  sendSuccess(res, question, "Question removed successfully");
});

const getTestQuestions = asyncHandler(async (req, res) => {
  const result = await teacherService.listQuestions(
    req.params.testId,
    req.query,
    req.user,
  );
  sendSuccess(res, result.items, "Question list fetched", 200, result.meta);
});

const addQuestionOptions = asyncHandler(async (req, res) => {
  const result = await teacherService.addQuestionOptions(
    req.params.questionId,
    req.body,
    req.user,
  );

  sendSuccess(res, result, "Question options added", 201);
});

const updateQuestionOption = asyncHandler(async (req, res) => {
  const result = await teacherService.updateQuestionOption(
    req.params.questionId,
    req.params.optionId,
    req.body,
    req.user,
  );

  sendSuccess(res, result, "Question option updated");
});

const assignCandidates = asyncHandler(async (req, res) => {
  const result = await teacherService.assignCandidates(
    req.params.testId,
    req.body,
    req.user,
  );

  sendSuccess(res, result, "Candidates assigned successfully");
});

const getCandidates = asyncHandler(async (req, res) => {
  const result = await teacherService.listCandidates(
    req.params.testId,
    req.query,
    req.user,
  );
  sendSuccess(res, result.items, "Candidate list fetched", 200, result.meta);
});

const publishTest = asyncHandler(async (req, res) => {
  const test = await teacherService.publishTest(req.params.testId, req.user);
  sendSuccess(res, test, "Test published successfully");
});

const getMetrics = asyncHandler(async (req, res) => {
  const metrics = await teacherService.getTestMetrics(
    req.params.testId,
    req.user,
  );
  sendSuccess(res, metrics, "Test metrics fetched");
});

const getTextAnswerReviews = asyncHandler(async (req, res) => {
  const result = await teacherService.getTextAnswerReviews(
    req.params.testId,
    req.query,
    req.user,
  );

  sendSuccess(
    res,
    result.items,
    "Text answer reviews fetched",
    200,
    result.meta,
  );
});

const reviewTextAnswer = asyncHandler(async (req, res) => {
  const result = await teacherService.reviewTextAnswer(
    req.params.answerId,
    req.body,
    req.user,
  );

  sendSuccess(res, result, "Text answer reviewed successfully");
});

module.exports = {
  createTest,
  getTests,
  getDashboardMetrics,
  getTestById,
  updateTest,
  createSlot,
  createQuestionSet,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getTestQuestions,
  addQuestionOptions,
  updateQuestionOption,
  assignCandidates,
  getCandidates,
  publishTest,
  getMetrics,
  getTextAnswerReviews,
  reviewTextAnswer,
};
