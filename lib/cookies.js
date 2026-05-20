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
  const parts = cookieString.split(';');
  const firstPart = parts.shift();
  if (firstPart === undefined) return;

  const eqIndex = firstPart.indexOf('=');
  if (eqIndex === -1) return;

  const name = firstPart.slice(0, eqIndex).trim();
  if (!name) return;

  const cookie = {
    name,
    value: firstPart.slice(eqIndex + 1).trim(),
    path: undefined,
    domain: undefined,
    expires: undefined,
    httpOnly: false,
    secure: false
  };

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    const attrName = (
      idx === -1 ? trimmed : trimmed.slice(0, idx)
    ).toLowerCase();
    const attrValue = idx === -1 ? '' : trimmed.slice(idx + 1).trim();

    switch (attrName) {
      case 'path': {
        cookie.path = attrValue || undefined;
        break;
      }
      case 'domain': {
        // tough-cookie strips a leading '.'; preserve that behavior
        cookie.domain = attrValue.startsWith('.')
          ? attrValue.slice(1) || undefined
          : attrValue || undefined;
        break;
      }
      case 'expires': {
        const date = new Date(attrValue);
        if (!Number.isNaN(date.getTime())) {
          cookie.expires = date.toISOString();
        }
        break;
      }
      case 'httponly': {
        cookie.httpOnly = true;
        break;
      }
      case 'secure': {
        cookie.secure = true;
        break;
      }
    }
  }

  return cookie;
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
