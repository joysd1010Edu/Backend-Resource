const jwt = require("jsonwebtoken");

const { User } = require("../models");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const auth = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  const token = bearerToken || req.cookies.access_token;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(
      500,
      "JWT_ACCESS_SECRET or JWT_SECRET is missing in environment variables",
    );
  }

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired token");
  }

  if (payload.token_type && payload.token_type !== "access") {
    throw new ApiError(401, "Invalid token type for protected route");
  }

  const user = await User.findById(payload.sub)
    .select(
      "_id full_name email user_id_login role status ref_id profile_image phone",
    )
    .lean();

  if (!user) {
    throw new ApiError(401, "User not found for token");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "User account is not active");
  }

  req.user = user;
  req.auth = payload;
  next();
});

module.exports = auth;
