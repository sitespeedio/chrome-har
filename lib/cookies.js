const Cookie = require("tough-cookie").Cookie;
const dayjs = require("dayjs");

function formatCookie(cookie) {
  return {
    name: cookie.key || cookie.name,
    value: cookie.value,
    path: cookie.path || undefined, // must be undefined, not null, to exclude empty path
    domain: cookie.domain || undefined, // must be undefined, not null, to exclude empty domain
    expires:
      cookie.expires === "Infinity"
        ? undefined
        : dayjs(cookie.expires).toISOString(),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure
  };
}

function parseCookie(cookieString) {
  let cookie = Cookie.parse(cookieString);
  if (!cookie) {
    return undefined;
  }

  return formatCookie(cookie);
}

function splitAndParse(header, divider) {
  return header
    .split(divider)
    .filter(Boolean)
    .map(parseCookie)
    .filter(Boolean);
}

module.exports = {
  parseRequestCookies(cookieHeader) {
    return splitAndParse(cookieHeader, ";");
  },
  parseResponseCookies(cookieHeader) {
    return splitAndParse(cookieHeader, "\n");
  },
  formatCookie
};
