const {
  loginUser,
  registerUser,
  refreshAuthTokens,
  logoutUser,
  createSeedUser,
  getMyProfile,
} = require("../services/authService");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

function getTokenMaxAge(token) {
  const decoded = jwt.decode(token);

  if (!decoded?.exp) {
    return undefined;
  }

  return Math.max(0, decoded.exp * 1000 - Date.now());
}

function buildCookieOptions(token) {
  const maxAge = getTokenMaxAge(token);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  if (maxAge !== undefined) {
    options.maxAge = maxAge;
  }

  return options;
}

function setAuthCookies(res, authResult) {
  res.cookie(
    "access_token",
    authResult.access_token,
    buildCookieOptions(authResult.access_token),
  );
  res.cookie(
    "refresh_token",
    authResult.refresh_token,
    buildCookieOptions(authResult.refresh_token),
  );
}

function clearAuthCookies(res) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  res.clearCookie("access_token", options);
  res.clearCookie("refresh_token", options);
}

function buildRequestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"] || null,
    cookieRefreshToken: req.cookies.refresh_token || null,
    bodyRefreshToken: req.body?.refresh_token || null,
  };
}

const login = asyncHandler(async (req, res) => {
  const authResult = await loginUser({
    ...req.body,
    context: buildRequestContext(req),
  });

  setAuthCookies(res, authResult);

  sendSuccess(
    res,
    {
      token: authResult.token,
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
      access_expires_in: authResult.access_expires_in,
      refresh_expires_in: authResult.refresh_expires_in,
      user: authResult.user,
    },
    "Login successful",
  );
});

const register = asyncHandler(async (req, res) => {
  const authResult = await registerUser({
    ...req.body,
    context: buildRequestContext(req),
  });

  setAuthCookies(res, authResult);

  sendSuccess(
    res,
    {
      token: authResult.token,
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
      access_expires_in: authResult.access_expires_in,
      refresh_expires_in: authResult.refresh_expires_in,
      user: authResult.user,
    },
    "Registration successful",
    201,
  );
});

const refresh = asyncHandler(async (req, res) => {
  const authResult = await refreshAuthTokens({
    refresh_token: req.body?.refresh_token,
    context: buildRequestContext(req),
  });

  setAuthCookies(res, authResult);

  sendSuccess(
    res,
    {
      token: authResult.token,
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
      access_expires_in: authResult.access_expires_in,
      refresh_expires_in: authResult.refresh_expires_in,
      user: authResult.user,
    },
    "Token refreshed successfully",
  );
});

const logout = asyncHandler(async (req, res) => {
  await logoutUser({
    refresh_token: req.body?.refresh_token,
    context: buildRequestContext(req),
  });

  clearAuthCookies(res);

  sendSuccess(res, { logged_out: true }, "Logout successful");
});

const me = asyncHandler(async (req, res) => {
  const profile = await getMyProfile(req.user._id);
  sendSuccess(res, profile, "Current user profile fetched");
});

const registerSeedUser = asyncHandler(async (req, res) => {
  const user = await createSeedUser(req.body);
  sendSuccess(res, user, "Seed user created", 201);
});

module.exports = {
  login,
  register,
  refresh,
  logout,
  me,
  registerSeedUser,
};
