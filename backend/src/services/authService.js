const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { User, RefreshToken } = require("../models");
const ApiError = require("../utils/apiError");

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_ACCESS_SECRET or JWT_SECRET is missing in environment variables",
    );
  }

  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_REFRESH_SECRET or JWT_SECRET is missing in environment variables",
    );
  }

  return secret;
}

function getAccessExpiresIn() {
  return (
    process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m"
  );
}

function getRefreshExpiresIn() {
  return process.env.JWT_REFRESH_EXPIRES_IN || "7d";
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function buildAuthPayload(user) {
  return {
    sub: String(user._id),
    role: user.role,
    ref_id: user.ref_id || null,
  };
}

function generateAccessToken(payload, options = {}) {
  return jwt.sign(
    {
      ...payload,
      token_type: "access",
    },
    getAccessSecret(),
    {
      expiresIn: getAccessExpiresIn(),
      ...options,
    },
  );
}

function generateRefreshToken(payload, options = {}) {
  return jwt.sign(
    {
      ...payload,
      token_type: "refresh",
      jti: crypto.randomUUID(),
    },
    getRefreshSecret(),
    {
      expiresIn: getRefreshExpiresIn(),
      ...options,
    },
  );
}

async function issueAuthTokens(user, context = {}) {
  const authPayload = buildAuthPayload(user);

  const accessToken = generateAccessToken(authPayload);
  const refreshToken = generateRefreshToken(authPayload);

  const decodedRefresh = jwt.decode(refreshToken);
  if (!decodedRefresh?.jti || !decodedRefresh?.exp) {
    throw new Error("Failed to decode refresh token payload");
  }

  await RefreshToken.create({
    user_id: user._id,
    jti: decodedRefresh.jti,
    token_hash: hashToken(refreshToken),
    expires_at: new Date(decodedRefresh.exp * 1000),
    created_by_ip: context.ip || null,
    user_agent: context.userAgent || null,
  });

  return {
    token: accessToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    refresh_jti: decodedRefresh.jti,
    access_expires_in: getAccessExpiresIn(),
    refresh_expires_in: getRefreshExpiresIn(),
  };
}

async function revokeRefreshTokenByValue(value, context = {}) {
  if (!value) {
    return { revoked: false };
  }

  const token = String(value).trim();
  if (!token) {
    return { revoked: false };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getRefreshSecret());
  } catch (error) {
    decoded = jwt.decode(token);
  }

  if (!decoded?.jti || !decoded?.sub || decoded.token_type !== "refresh") {
    return { revoked: false };
  }

  const refreshSession = await RefreshToken.findOne({
    jti: decoded.jti,
    user_id: decoded.sub,
    token_hash: hashToken(token),
  });

  if (!refreshSession) {
    return { revoked: false };
  }

  if (!refreshSession.revoked_at) {
    refreshSession.revoked_at = new Date();
    refreshSession.revoked_by_ip = context.ip || null;
    await refreshSession.save();
  }

  return { revoked: true };
}

async function revokeAllRefreshTokensForUser(userId, context = {}) {
  await RefreshToken.updateMany(
    {
      user_id: userId,
      revoked_at: null,
      expires_at: { $gt: new Date() },
    },
    {
      $set: {
        revoked_at: new Date(),
        revoked_by_ip: context.ip || null,
      },
    },
  );
}

async function rotateRefreshToken(payload = {}, context = {}) {
  const refreshTokenValue =
    payload.refresh_token || context.refreshToken || context.cookieRefreshToken;

  if (!refreshTokenValue) {
    throw new ApiError(401, "refresh_token is required");
  }

  let decoded;
  try {
    decoded = jwt.verify(String(refreshTokenValue), getRefreshSecret());
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  if (decoded.token_type !== "refresh" || !decoded.jti || !decoded.sub) {
    throw new ApiError(401, "Invalid refresh token payload");
  }

  const session = await RefreshToken.findOne({
    jti: decoded.jti,
    user_id: decoded.sub,
  });

  if (!session) {
    throw new ApiError(401, "Refresh session not found");
  }

  const tokenHash = hashToken(String(refreshTokenValue));

  if (
    session.token_hash !== tokenHash ||
    session.revoked_at ||
    session.expires_at <= new Date()
  ) {
    await revokeAllRefreshTokensForUser(decoded.sub, context);
    throw new ApiError(401, "Refresh token is no longer valid");
  }

  const user = await User.findById(decoded.sub).select("+password_hash");

  if (!user) {
    throw new ApiError(401, "User not found for refresh token");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "User account is not active");
  }

  const tokens = await issueAuthTokens(user, context);

  session.revoked_at = new Date();
  session.revoked_by_ip = context.ip || null;
  session.replaced_by_jti = tokens.refresh_jti;
  await session.save();

  return {
    ...tokens,
    user: sanitizeUser(user),
  };
}

function resolveRequestContext(context = {}) {
  return {
    ip: context.ip || null,
    userAgent: context.userAgent || null,
    refreshToken:
      context.refreshToken ||
      context.cookieRefreshToken ||
      context.bodyRefreshToken ||
      null,
  };
}

function buildAuthResponse(tokens, user) {
  return {
    token: tokens.access_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_expires_in: tokens.access_expires_in,
    refresh_expires_in: tokens.refresh_expires_in,
    user,
  };
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    ref_id: user.ref_id || null,
    full_name: user.full_name,
    email: user.email || null,
    user_id_login: user.user_id_login || null,
    role: user.role,
    status: user.status,
    profile_image: user.profile_image || null,
    phone: user.phone || null,
    last_login_at: user.last_login_at || null,
  };
}

function resolveLoginIdentifier(payload = {}) {
  return (payload.login || payload.email || payload.user_id_login || "")
    .toString()
    .trim();
}

async function assertUniqueAuthIdentity({ email, userIdLogin }) {
  const checks = [];

  if (email) {
    checks.push({ email });
  }

  if (userIdLogin) {
    checks.push({ user_id_login: userIdLogin });
  }

  if (checks.length === 0) {
    return;
  }

  const existing = await User.findOne({ $or: checks })
    .select("_id email user_id_login")
    .lean();

  if (!existing) {
    return;
  }

  if (email && existing.email === email) {
    throw new ApiError(409, "email is already in use");
  }

  if (userIdLogin && existing.user_id_login === userIdLogin) {
    throw new ApiError(409, "user_id_login is already in use");
  }

  throw new ApiError(409, "User identity already exists");
}

async function loginUser(payload) {
  const loginIdentifier = resolveLoginIdentifier(payload);
  const password = String(payload.password || "");

  if (!loginIdentifier || !password) {
    throw new ApiError(
      400,
      "login/email/user_id_login and password are required",
    );
  }

  const identifierLower = loginIdentifier.toLowerCase();

  const user = await User.findOne({
    $or: [{ email: identifierLower }, { user_id_login: loginIdentifier }],
  }).select("+password_hash");

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "User account is not active");
  }

  user.last_login_at = new Date();
  await user.save();

  const context = resolveRequestContext(payload.context);
  const tokens = await issueAuthTokens(user, context);

  return buildAuthResponse(tokens, sanitizeUser(user));
}

async function createSeedUser(payload = {}) {
  const role = payload.role || "teacher";

  if (!["teacher", "student", "admin"].includes(role)) {
    throw new ApiError(400, "role must be teacher, student, or admin");
  }

  const email = payload.email?.toLowerCase().trim();
  const userIdLogin = payload.user_id_login?.trim();
  const password = payload.password;
  const fullName = payload.full_name?.trim();

  if (!fullName || !password || (!email && !userIdLogin)) {
    throw new ApiError(
      400,
      "full_name, password, and at least one of email or user_id_login are required",
    );
  }

  const user = await User.create({
    ref_id: payload.ref_id || `U-${Date.now().toString(36)}`,
    full_name: fullName,
    email,
    user_id_login: userIdLogin,
    password_hash: password,
    role,
    status: payload.status || "active",
    profile_image: payload.profile_image || null,
    phone: payload.phone || null,
  });

  return sanitizeUser(user);
}

async function registerUser(payload = {}) {
  const fullName = payload.full_name?.trim();
  const password = payload.password;
  const email = payload.email?.toLowerCase().trim();
  const userIdLogin = payload.user_id_login?.trim();
  const role = payload.role || "student";

  if (!fullName || !password || (!email && !userIdLogin)) {
    throw new ApiError(
      400,
      "full_name, password, and at least one of email or user_id_login are required",
    );
  }

  if (!["teacher", "student"].includes(role)) {
    throw new ApiError(400, "role must be teacher or student");
  }

  await assertUniqueAuthIdentity({ email, userIdLogin });

  const user = await User.create({
    ref_id: payload.ref_id || `U-${Date.now().toString(36)}`,
    full_name: fullName,
    email,
    user_id_login: userIdLogin,
    password_hash: password,
    role,
    status: "active",
    profile_image: payload.profile_image || null,
    phone: payload.phone || null,
  });

  const context = resolveRequestContext(payload.context);
  const tokens = await issueAuthTokens(user, context);

  return buildAuthResponse(tokens, sanitizeUser(user));
}

async function refreshAuthTokens(payload = {}) {
  const context = resolveRequestContext(payload.context);
  const refreshed = await rotateRefreshToken(
    {
      refresh_token: payload.refresh_token,
    },
    context,
  );

  return buildAuthResponse(refreshed, refreshed.user);
}

async function logoutUser(payload = {}) {
  const context = resolveRequestContext(payload.context);

  await revokeRefreshTokenByValue(
    payload.refresh_token || context.refreshToken,
    {
      ip: context.ip,
    },
  );

  return { success: true };
}

async function getMyProfile(userId) {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return sanitizeUser(user);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  loginUser,
  registerUser,
  refreshAuthTokens,
  logoutUser,
  createSeedUser,
  getMyProfile,
};
