const { body, param, query } = require("express-validator");

const studentTestsQueryValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("search")
    .optional()
    .isString()
    .withMessage("search must be a string")
    .trim(),
];

const performedExamsQueryValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("search")
    .optional()
    .isString()
    .withMessage("search must be a string")
    .trim(),
  query("status")
    .optional()
    .isIn(["submitted", "timeout", "all"])
    .withMessage("status must be submitted, timeout, or all"),
];

const testIdParamValidator = [
  param("testId").isMongoId().withMessage("testId must be a valid Mongo id"),
];

const attemptIdParamValidator = [
  param("attemptId")
    .isMongoId()
    .withMessage("attemptId must be a valid Mongo id"),
];

const startTestValidator = [
  ...testIdParamValidator,
  body("device_info")
    .optional()
    .isObject()
    .withMessage("device_info must be an object"),
];

const answerAttemptValidator = [
  ...attemptIdParamValidator,
  body("selected_option_ids")
    .optional()
    .isArray({ min: 1 })
    .withMessage("selected_option_ids must be a non-empty array"),
  body("selected_option_ids.*")
    .optional()
    .isMongoId()
    .withMessage("selected_option_ids must contain valid option ids"),
  body("text_answer_html")
    .optional()
    .isString()
    .withMessage("text_answer_html must be a string"),
  body("text_answer_plain")
    .optional()
    .isString()
    .withMessage("text_answer_plain must be a string"),
  body().custom((value) => {
    const hasOptions =
      Array.isArray(value.selected_option_ids) &&
      value.selected_option_ids.length > 0;
    const hasText =
      (typeof value.text_answer_plain === "string" &&
        value.text_answer_plain.trim().length > 0) ||
      (typeof value.text_answer_html === "string" &&
        value.text_answer_html.trim().length > 0);

    if (!hasOptions && !hasText) {
      throw new Error(
        "Provide selected_option_ids for MCQ or text_answer_plain/text_answer_html for text question",
      );
    }

    return true;
  }),
];

const skipAttemptValidator = [...attemptIdParamValidator];
const submitAttemptValidator = [...attemptIdParamValidator];
const resultAttemptValidator = [...attemptIdParamValidator];

module.exports = {
  studentTestsQueryValidator,
  performedExamsQueryValidator,
  testIdParamValidator,
  attemptIdParamValidator,
  startTestValidator,
  answerAttemptValidator,
  skipAttemptValidator,
  submitAttemptValidator,
  resultAttemptValidator,
};
