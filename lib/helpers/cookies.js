import { Cookie } from 'tough-cookie';

export function formatCookie(cookie) {
  let expiresISO;

  if (cookie.expires instanceof Date) {
    expiresISO = cookie.expires.toISOString();
  } else if (cookie.expires === 'Infinity' || cookie.expires === null) {
    expiresISO = undefined;
  } else {
    const date = new Date(cookie.expires);
    expiresISO = Number.isNaN(date) ? undefined : date.toISOString();
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
    return;
  }

  return formatCookie(cookie);
}

function splitAndParse(header, divider) {
  return header
    .split(divider)
    .filter(Boolean)
    .map(element => parseCookie(element))
    .filter(Boolean);
}

export function parseRequestCookies(cookieHeader) {
  return splitAndParse(cookieHeader, ';');
}

export function parseResponseCookies(cookieHeader) {
  return splitAndParse(cookieHeader, '\n');
}
