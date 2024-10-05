const Cookie = require('tough-cookie').Cookie;

function formatCookie(cookie) {
  let expiresISO;

  if (cookie.expires instanceof Date) {
    expiresISO = cookie.expires.toISOString();
  } else if (cookie.expires === 'Infinity' || cookie.expires === null) {
    expiresISO = null;
  } else {
    const date = new Date(cookie.expires);
    if (!isNaN(date)) {
      expiresISO = date.toISOString();
    } else {
      // There's no date
      expiresISO = null;
    }
  }
  return {
    name: cookie.key || cookie.name,
    value: cookie.value,
    path: cookie.path || undefined, // must be undefined, not null, to exclude empty path
    domain: cookie.domain || undefined, // must be undefined, not null, to exclude empty domain
    expires: expiresISO,
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
    return splitAndParse(cookieHeader, ';');
  },
  parseResponseCookies(cookieHeader) {
    return splitAndParse(cookieHeader, '\n');
  },
  formatCookie
};
