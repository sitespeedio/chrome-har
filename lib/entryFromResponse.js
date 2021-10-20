'use strict';
const dayjs = require('dayjs');
const max = Math.max;

const {
  calculateRequestHeaderSize,
  calculateResponseHeaderSize,
  getHeaderValue,
  parseHeaders
} = require('./headers');

const { parseRequestCookies, parseResponseCookies } = require('./cookies');
const { isHttp1x, formatMillis } = require('./util');
function firstNonNegative(values) {
  for (let i = 0; i < values.length; ++i) {
    if (values[i] >= 0) return values[i];
  }
  return -1;
}

function formatIP(ipAddress) {
  if (typeof ipAddress !== 'string') {
    return undefined;
  }
  // IPv6 addresses are listed as [2a00:1450:400f:80a::2003]
  return ipAddress.replace(/^\[|]$/g, '');
}

module.exports = function(entry, response, page, options) {
  const responseHeaders = response.headers;
  const cookieHeader = getHeaderValue(responseHeaders, 'Set-Cookie');

  let cookies = parseResponseCookies(cookieHeader);
  let headers = parseHeaders(responseHeaders);

  if (entry.extraResponseInfo) {
    if (entry.extraResponseInfo.headers) {
      headers = entry.extraResponseInfo.headers.concat(
        headers.filter(
          ({ name }) => !headers.find(header => header.name === name)
        )
      );
    }

    if (entry.extraResponseInfo.blockedCookies) {
      cookies = cookies.filter(
        ({ name }) =>
          !entry.extraResponseInfo.blockedCookies.find(blockedCookie => {
            if (blockedCookie.cookie) {
              return blockedCookie.cookie.name === name;
            } else if (blockedCookie.cookieLine) {
              const cookie = parseResponseCookies(blockedCookie.cookieLine)[0];
              if (cookie) {
                return cookie.name === name;
              }
            }

            return false;
          })
      );
    }

    // Remove extra info once it has been added to the response
    delete entry.extraResponseInfo;
  }

  // response.body must be set by the library user, by either calling
  // Network.getResponseBody or Network.getResponseBodyForInterception as it is
  // not part of the Chrome DevTools Protocol specification.
  // See https://chromedevtools.github.io/devtools-protocol/tot/Network#type-Response
  const text =
    options != null && options.includeTextFromResponseBody
      ? response.body
      : undefined;

  entry.response = {
    httpVersion: response.protocol,
    redirectURL: '',
    status: response.status,
    statusText: response.statusText,
    content: {
      encoding: response.encoding,
      mimeType: response.mimeType,
      size: text != null ? text.length : 0,
      text: text
    },
    headersSize: -1,
    bodySize: -1,
    cookies,
    headers,
    _transferSize: response.encodedDataLength
  };

  const locationHeaderValue = getHeaderValue(responseHeaders, 'Location');
  if (locationHeaderValue) {
    entry.response.redirectURL = locationHeaderValue;
  }

  entry.request.httpVersion = response.protocol;

  if (response.fromDiskCache === true) {
    if (isHttp1x(response.protocol)) {
      // In http2 headers are compressed, so calculating size from headers text wouldn't be correct.
      entry.response.headersSize = calculateResponseHeaderSize(response);
    }

    // h2 push might cause resource to be received before parser sees and requests it.
    if (response.timing && !(response.timing.pushStart > 0)) {
      entry.cache.beforeRequest = {
        lastAccess: '',
        eTag: '',
        hitCount: 0
      };
    }
  } else {
    if (response.requestHeaders) {
      entry.request.headers = parseHeaders(response.requestHeaders);

      const cookieHeader = getHeaderValue(response.requestHeaders, 'Cookie');
      entry.request.cookies = parseRequestCookies(cookieHeader);
    }

    if (isHttp1x(response.protocol)) {
      if (response.headersText) {
        entry.response.headersSize = response.headersText.length;
      } else {
        entry.response.headersSize = calculateResponseHeaderSize(response);
      }

      entry.response.bodySize =
        response.encodedDataLength - entry.response.headersSize;

      if (response.requestHeadersText) {
        entry.request.headersSize = response.requestHeadersText.length;
      } else {
        // Since entry.request.httpVersion is now set, we can calculate header size.
        entry.request.headersSize = calculateRequestHeaderSize(entry.request);
      }
    }
  }

  entry.connection = response.connectionId.toString();
  entry.serverIPAddress = formatIP(response.remoteIPAddress);

  function parseOptionalTime(timing, start, end) {
    if (timing[start] >= 0) {
      return formatMillis(timing[end] - timing[start]);
    }
    return -1;
  }

  const timing = response.timing;
  if (timing) {
    const blocked = formatMillis(
      firstNonNegative([timing.dnsStart, timing.connectStart, timing.sendStart])
    );

    const dns = parseOptionalTime(timing, 'dnsStart', 'dnsEnd');
    const connect = parseOptionalTime(timing, 'connectStart', 'connectEnd');
    const send = formatMillis(timing.sendEnd - timing.sendStart);
    const wait = formatMillis(timing.receiveHeadersEnd - timing.sendEnd);
    const receive = 0;

    const ssl = parseOptionalTime(timing, 'sslStart', 'sslEnd');

    entry.timings = {
      blocked,
      dns,
      connect,
      send,
      wait,
      receive,
      ssl
    };

    entry._requestTime = timing.requestTime;
    entry.__receiveHeadersEnd = timing.receiveHeadersEnd;
    if (timing.pushStart > 0) {
      // use the same extended field as WebPageTest
      entry._was_pushed = 1;
    }

    entry.time =
      max(0, blocked) + max(0, dns) + max(0, connect) + send + wait + receive;

    // Some cached responses generate a Network.requestServedFromCache event,
    // but fromDiskCache is still set to false.
    if (!entry.__servedFromCache) {
      // wallTime is not necessarily monotonic, timestamp is. So calculate startedDateTime from timestamp diffs.
      // (see https://cs.chromium.org/chromium/src/third_party/WebKit/Source/platform/network/ResourceLoadTiming.h?q=requestTime+package:%5Echromium$&dr=CSs&l=84)
      const entrySecs =
        page.__wallTime + (timing.requestTime - page.__timestamp);
      entry.startedDateTime = dayjs.unix(entrySecs).toISOString();

      const queuedMillis =
        (timing.requestTime - entry.__requestWillBeSentTime) * 1000;
      if (queuedMillis > 0) {
        entry.timings._queued = formatMillis(queuedMillis);
      }
    }

    if (entry.cache && entry.cache.beforeRequest) {
      // lastAccess needs to be a valid date
      entry.cache.beforeRequest.lastAccess = entry.startedDateTime;
    }
  } else {
    entry.timings = {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: 0,
      receive: 0,
      ssl: -1,
      comment: 'No timings available from Chrome'
    };
    entry.time = 0;
  }
};
