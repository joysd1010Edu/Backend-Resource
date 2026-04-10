const { body } = require("express-validator");

const loginValidator = [
  body("password")
    .exists({ checkFalsy: true })
    .withMessage("password is required")
    .isString()
    .withMessage("password must be a string"),
  body().custom((value) => {
    const hasLogin = !!value?.login;
    const hasEmail = !!value?.email;
    const hasUserIdLogin = !!value?.user_id_login;

    if (!hasLogin && !hasEmail && !hasUserIdLogin) {
      throw new Error("Provide login or email or user_id_login");
    }

    return true;
  }),
];

const registerValidator = [
  body("full_name").trim().notEmpty().withMessage("full_name is required"),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("password must be at least 8 characters"),
  body("role")
    .optional()
    .isIn(["teacher", "student"])
    .withMessage("role must be teacher or student"),
  body().custom((value) => {
    if (!value?.email && !value?.user_id_login) {
      throw new Error("email or user_id_login is required");
    }

    return true;
  }),
  body("email")
    .optional()
    .isEmail()
    .withMessage("email must be valid")
    .normalizeEmail(),
  body("user_id_login")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("user_id_login must be a non-empty string"),
  body("phone").optional().isString().withMessage("phone must be a string"),
  body("profile_image")
    .optional()
    .isString()
    .withMessage("profile_image must be a string"),
];

const refreshTokenValidator = [
  body("refresh_token")
    .optional()
    .isString()
    .withMessage("refresh_token must be a string"),
];

const logoutValidator = [
  body("refresh_token")
    .optional()
    .isString()
    .withMessage("refresh_token must be a string"),
];

const registerSeedValidator = [
  body("full_name").trim().notEmpty().withMessage("full_name is required"),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("password must be at least 8 characters"),
  body("role")
    .optional()
    .isIn(["teacher", "student", "admin"])
    .withMessage("role must be teacher, student, or admin"),
  body().custom((value) => {
    if (!value?.email && !value?.user_id_login) {
      throw new Error("email or user_id_login is required");
    }

    return true;
  }),
  body("email")
    .optional()
    .isEmail()
    .withMessage("email must be valid")
    .normalizeEmail(),
  body("user_id_login")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("user_id_login must be a non-empty string"),
];

module.exports = {
  loginValidator,
  registerValidator,
  refreshTokenValidator,
  logoutValidator,
  registerSeedValidator,
};
