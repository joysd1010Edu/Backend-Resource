/* ==========  backend/src/validators/teacherValidators.js  ===============*/
const { body, param, query } = require("express-validator");

const {
  QUESTION_TYPES,
  QUESTION_TYPE_MODES,
  TEST_STATUS,
  ACTIVE_STATUS,
  QUESTION_STATUS,
  ATTENDANCE_STATUS,
  REVIEW_STATUS,
} = require("../utils/enums");

const testIdParamValidator = [
  param("testId").isMongoId().withMessage("testId must be a valid Mongo id"),
];

const questionIdParamValidator = [
  param("questionId")
    .isMongoId()
    .withMessage("questionId must be a valid Mongo id"),
];

const createTestValidator = [
  body("title").trim().notEmpty().withMessage("title is required"),
  body("start_time").isISO8601().withMessage("start_time must be a valid date"),
  body("end_time").isISO8601().withMessage("end_time must be a valid date"),
  body("duration_minutes")
    .isInt({ min: 1 })
    .withMessage("duration_minutes must be at least 1"),
  body("total_slots")
    .optional()
    .isInt({ min: 1 })
    .withMessage("total_slots must be >= 1"),
  body("total_question_set")
    .optional()
    .isInt({ min: 1 })
    .withMessage("total_question_set must be >= 1"),
  body("total_candidates")
    .optional()
    .isInt({ min: 0 })
    .withMessage("total_candidates must be >= 0"),
  body("total_audience")
    .optional()
    .isInt({ min: 0 })
    .withMessage("total_audience must be >= 0"),
  body("question_type_mode")
    .optional()
    .isIn(QUESTION_TYPE_MODES)
    .withMessage("Invalid question_type_mode"),
  body("negative_marking_enabled")
    .optional()
    .isBoolean()
    .withMessage("negative_marking_enabled must be boolean"),
  body("negative_mark_per_wrong")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("negative_mark_per_wrong must be >= 0"),
  body("status")
    .optional()
    .isIn(TEST_STATUS)
    .withMessage("Invalid test status"),
  body("show_result_to_student")
    .optional()
    .isBoolean()
    .withMessage("show_result_to_student must be boolean"),
  body("randomize_question_order")
    .optional()
    .isBoolean()
    .withMessage("randomize_question_order must be boolean"),
  body("randomize_option_order")
    .optional()
    .isBoolean()
    .withMessage("randomize_option_order must be boolean"),
  body("end_time").custom((value, { req }) => {
    if (new Date(value) <= new Date(req.body.start_time)) {
      throw new Error("end_time must be greater than start_time");
    }

    return true;
  }),
];

const listTestsValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("search")
    .optional()
    .isString()
    .withMessage("search must be a string")
    .trim(),
  query("status")
    .optional()
    .isIn(TEST_STATUS)
    .withMessage("Invalid test status filter"),
  query("sort_by")
    .optional()
    .isIn(["created_at", "updated_at", "title", "start_time", "status"])
    .withMessage("Invalid sort_by field"),
  query("sort_order")
    .optional()
    .isIn(["asc", "desc", "ASC", "DESC"])
    .withMessage("sort_order must be asc or desc"),
];

const updateTestValidator = [
  ...testIdParamValidator,
  body().custom((value) => {
    const fields = [
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

    if (!fields.some((field) => value[field] !== undefined)) {
      throw new Error("At least one field is required for update");
    }

    return true;
  }),
  body("question_type_mode")
    .optional()
    .isIn(QUESTION_TYPE_MODES)
    .withMessage("Invalid question_type_mode"),
  body("duration_minutes")
    .optional()
    .isInt({ min: 1 })
    .withMessage("duration_minutes must be at least 1"),
  body("status")
    .optional()
    .isIn(TEST_STATUS)
    .withMessage("Invalid test status"),
  body("negative_marking_enabled")
    .optional()
    .isBoolean()
    .withMessage("negative_marking_enabled must be boolean"),
  body("negative_mark_per_wrong")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("negative_mark_per_wrong must be >= 0"),
  body("start_time")
    .optional()
    .isISO8601()
    .withMessage("start_time must be a valid date"),
  body("end_time")
    .optional()
    .isISO8601()
    .withMessage("end_time must be a valid date"),
  body("show_result_to_student")
    .optional()
    .isBoolean()
    .withMessage("show_result_to_student must be boolean"),
  body("randomize_question_order")
    .optional()
    .isBoolean()
    .withMessage("randomize_question_order must be boolean"),
  body("randomize_option_order")
    .optional()
    .isBoolean()
    .withMessage("randomize_option_order must be boolean"),
];

const createSlotValidator = [
  ...testIdParamValidator,
  body("slot_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("slot_no must be >= 1"),
  body("start_time").isISO8601().withMessage("start_time must be a valid date"),
  body("end_time").isISO8601().withMessage("end_time must be a valid date"),
  body("duration_minutes")
    .isInt({ min: 1 })
    .withMessage("duration_minutes must be >= 1"),
  body("candidate_limit")
    .optional()
    .isInt({ min: 0 })
    .withMessage("candidate_limit must be >= 0"),
  body("status")
    .optional()
    .isIn(ACTIVE_STATUS)
    .withMessage("status must be active or inactive"),
  body("end_time").custom((value, { req }) => {
    if (new Date(value) <= new Date(req.body.start_time)) {
      throw new Error("end_time must be greater than start_time");
    }

    return true;
  }),
];

const createQuestionSetValidator = [
  ...testIdParamValidator,
  body("set_name").trim().notEmpty().withMessage("set_name is required"),
  body("set_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("set_no must be >= 1"),
  body("status")
    .optional()
    .isIn(ACTIVE_STATUS)
    .withMessage("status must be active or inactive"),
];

const createQuestionValidator = [
  ...testIdParamValidator,
  body("question_set_id")
    .isMongoId()
    .withMessage("question_set_id must be a valid Mongo id"),
  body("question_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("question_no must be >= 1"),
  body("question_type")
    .isIn(QUESTION_TYPES)
    .withMessage("question_type must be radio, checkbox or text"),
  body("title_html").trim().notEmpty().withMessage("title_html is required"),
  body("score")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("score must be >= 0"),
  body("negative_mark")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("negative_mark must be >= 0"),
  body("is_required")
    .optional()
    .isBoolean()
    .withMessage("is_required must be boolean"),
  body("options")
    .optional()
    .isArray({ min: 1 })
    .withMessage("options must be a non-empty array"),
  body("options.*.option_key")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_key is required for each option"),
  body("options.*.option_text_html")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_text_html is required for each option"),
  body("options.*.sort_order")
    .optional()
    .isInt({ min: 1 })
    .withMessage("sort_order must be >= 1"),
  body("options.*.is_correct")
    .optional()
    .isBoolean()
    .withMessage("is_correct must be boolean"),
  body().custom((value) => {
    if (["radio", "checkbox"].includes(value.question_type)) {
      if (!Array.isArray(value.options) || value.options.length === 0) {
        throw new Error(
          "options are required for radio and checkbox questions",
        );
      }
    }

    if (
      value.question_type === "text" &&
      Array.isArray(value.options) &&
      value.options.length > 0
    ) {
      throw new Error("text questions cannot have options");
    }

    return true;
  }),
];

const updateQuestionValidator = [
  ...questionIdParamValidator,
  body().custom((value) => {
    const updatable = [
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
      "options",
    ];

    if (!updatable.some((field) => value[field] !== undefined)) {
      throw new Error("At least one field is required for question update");
    }

    return true;
  }),
  body("question_set_id")
    .optional()
    .isMongoId()
    .withMessage("question_set_id must be a valid Mongo id"),
  body("question_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("question_no must be >= 1"),
  body("question_type")
    .optional()
    .isIn(QUESTION_TYPES)
    .withMessage("question_type must be radio, checkbox or text"),
  body("title_html")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("title_html cannot be empty"),
  body("score")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("score must be >= 0"),
  body("negative_mark")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("negative_mark must be >= 0"),
  body("status")
    .optional()
    .isIn(QUESTION_STATUS)
    .withMessage("Invalid question status"),
  body("is_required")
    .optional()
    .isBoolean()
    .withMessage("is_required must be boolean"),
  body("options")
    .optional()
    .isArray({ min: 1 })
    .withMessage("options must be a non-empty array when provided"),
];

const deleteQuestionValidator = [...questionIdParamValidator];

const listQuestionsValidator = [
  ...testIdParamValidator,
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("question_set_id")
    .optional()
    .isMongoId()
    .withMessage("question_set_id must be a valid Mongo id"),
  query("status")
    .optional()
    .isIn(QUESTION_STATUS)
    .withMessage("Invalid question status filter"),
];

const addQuestionOptionsValidator = [
  ...questionIdParamValidator,
  body("options")
    .isArray({ min: 1 })
    .withMessage("options must be a non-empty array"),
  body("options.*.option_key")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_key is required"),
  body("options.*.option_text_html")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_text_html is required"),
  body("options.*.sort_order")
    .optional()
    .isInt({ min: 1 })
    .withMessage("sort_order must be >= 1"),
  body("options.*.is_correct")
    .optional()
    .isBoolean()
    .withMessage("is_correct must be boolean"),
];

const updateQuestionOptionValidator = [
  ...questionIdParamValidator,
  param("optionId")
    .isMongoId()
    .withMessage("optionId must be a valid Mongo id"),
  body().custom((value) => {
    const fields = [
      "option_key",
      "option_text_html",
      "plain_text",
      "is_correct",
      "sort_order",
    ];
    if (!fields.some((field) => value[field] !== undefined)) {
      throw new Error("At least one option field is required for update");
    }

    return true;
  }),
  body("option_key")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_key cannot be empty"),
  body("option_text_html")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("option_text_html cannot be empty"),
  body("sort_order")
    .optional()
    .isInt({ min: 1 })
    .withMessage("sort_order must be >= 1"),
  body("is_correct")
    .optional()
    .isBoolean()
    .withMessage("is_correct must be boolean"),
];

const assignCandidatesValidator = [
  ...testIdParamValidator,
  body("slot_id").isMongoId().withMessage("slot_id must be a valid Mongo id"),
  body("question_set_id")
    .isMongoId()
    .withMessage("question_set_id must be a valid Mongo id"),
  body("student_ids")
    .isArray({ min: 1 })
    .withMessage("student_ids must be a non-empty array"),
  body("student_ids.*")
    .isMongoId()
    .withMessage("Each student id must be a valid Mongo id"),
];

const listCandidatesValidator = [
  ...testIdParamValidator,
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("attendance_status")
    .optional()
    .isIn(ATTENDANCE_STATUS)
    .withMessage("Invalid attendance_status filter"),
];

const publishTestValidator = [...testIdParamValidator];
const metricsValidator = [...testIdParamValidator];

const getTextAnswerReviewsValidator = [
  ...testIdParamValidator,
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit").optional().isInt({ min: 1 }).withMessage("limit must be >= 1"),
  query("review_status")
    .optional()
    .isIn(REVIEW_STATUS)
    .withMessage("Invalid review_status filter"),
];

const reviewTextAnswerValidator = [
  param("answerId")
    .isMongoId()
    .withMessage("answerId must be a valid Mongo id"),
  body("obtained_marks")
    .isFloat({ min: 0 })
    .withMessage("obtained_marks must be a non-negative number"),
  body("is_correct")
    .optional()
    .isBoolean()
    .withMessage("is_correct must be boolean"),
  body("review_comment")
    .optional()
    .isString()
    .withMessage("review_comment must be a string"),
];

module.exports = {
  testIdParamValidator,
  questionIdParamValidator,
  createTestValidator,
  listTestsValidator,
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
};
