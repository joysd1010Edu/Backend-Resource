/* ==========  backend/src/routes/teacherRoutes.js  ===============*/
const express = require("express");

const auth = require("../middlewares/authMiddleware");
const allowRoles = require("../middlewares/roleMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const teacherController = require("../controllers/teacherController");
const {
  createTestValidator,
  listTestsValidator,
  testIdParamValidator,
  updateTestValidator,
  createSlotValidator,
  createQuestionSetValidator,
  createQuestionValidator,
  updateQuestionValidator,
  deleteQuestionValidator,
  listQuestionsValidator,
  addQuestionOptionsValidator,
  updateQuestionOptionValidator,
  assignCandidatesValidator,
  listCandidatesValidator,
  publishTestValidator,
  metricsValidator,
  getTextAnswerReviewsValidator,
  reviewTextAnswerValidator,
} = require("../validators/teacherValidators");

const router = express.Router();

router.use(auth, allowRoles("teacher", "admin"));

router.post(
  "/tests",
  createTestValidator,
  validateRequest,
  teacherController.createTest,
);
router.get(
  "/tests",
  listTestsValidator,
  validateRequest,
  teacherController.getTests,
);
router.get("/dashboard/metrics", teacherController.getDashboardMetrics);
router.get(
  "/tests/:testId",
  testIdParamValidator,
  validateRequest,
  teacherController.getTestById,
);
router.patch(
  "/tests/:testId",
  updateTestValidator,
  validateRequest,
  teacherController.updateTest,
);
// 
router.post(
  "/tests/:testId/slots",
  createSlotValidator,
  validateRequest,
  teacherController.createSlot,
);
router.post(
  "/tests/:testId/question-sets",
  createQuestionSetValidator,
  validateRequest,
  teacherController.createQuestionSet,
);

router.post(
  "/tests/:testId/questions",
  createQuestionValidator,
  validateRequest,
  teacherController.createQuestion,
);

router.get(
  "/tests/:testId/questions",
  listQuestionsValidator,
  validateRequest,
  teacherController.getTestQuestions,
);

router.patch(
  "/questions/:questionId",
  updateQuestionValidator,
  validateRequest,
  teacherController.updateQuestion,
);

router.delete(
  "/questions/:questionId",
  deleteQuestionValidator,
  validateRequest,
  teacherController.deleteQuestion,
);

router.post(
  "/questions/:questionId/options",
  addQuestionOptionsValidator,
  validateRequest,
  teacherController.addQuestionOptions,
);

router.patch(
  "/questions/:questionId/options/:optionId",
  updateQuestionOptionValidator,
  validateRequest,
  teacherController.updateQuestionOption,
);

router.post(
  "/tests/:testId/candidates/assign",
  assignCandidatesValidator,
  validateRequest,
  teacherController.assignCandidates,
);

router.get(
  "/tests/:testId/candidates",
  listCandidatesValidator,
  validateRequest,
  teacherController.getCandidates,
);

router.post(
  "/tests/:testId/publish",
  publishTestValidator,
  validateRequest,
  teacherController.publishTest,
);

router.get(
  "/tests/:testId/metrics",
  metricsValidator,
  validateRequest,
  teacherController.getMetrics,
);

router.get(
  "/tests/:testId/text-answer-reviews",
  getTextAnswerReviewsValidator,
  validateRequest,
  teacherController.getTextAnswerReviews,
);

router.post(
  "/attempt-answers/:answerId/review",
  reviewTextAnswerValidator,
  validateRequest,
  teacherController.reviewTextAnswer,
);

module.exports = router;
