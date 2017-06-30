const Cookie = require('tough-cookie').Cookie;
const moment = require('moment');

function parseCookie(cookieString) {
  let cookie = Cookie.parse(cookieString);
  if (!cookie) {
    return undefined;
  }

  return {
    name: cookie.key,
    value: cookie.value,
    path: cookie.path || undefined, // must be undefined, not null, to exclude empty path
    domain: cookie.domain || undefined, // must be undefined, not null, to exclude empty domain
    expires:
      cookie.expires === 'Infinity'
        ? undefined
        : moment(cookie.expires).toISOString(),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure
  };
}

function splitAndParse(header, divider) {
  return header.split(divider).filter(Boolean).map(parseCookie).filter(Boolean);
}

module.exports = {
  parseRequestCookies(cookieHeader) {
    return splitAndParse(cookieHeader, ';');
  },
  parseResponseCookies(cookieHeader) {
    return splitAndParse(cookieHeader, '\n');
  }
};
