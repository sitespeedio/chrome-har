'use strict';

const { name, version, homepage } = require('./package');

const urlParser = require('url');
const uuid = require('uuid/v1');
const debug = require('debug')(name);

const { parseRequestCookies, parseResponseCookies } = require('./lib/cookies');
const {
  calculateRequestHeaderSize,
  calculateResponseHeaderSize,
  getHeaderValue,
  parseHeaders
} = require('./lib/headers');

const max = Math.max;

const defaultOptions = {
  includeResourcesFromDiskCache: false
};

const isEmpty = o => !o;

function formatMillis(time, fractionalDigits = 3) {
  return Number(Number(time).toFixed(fractionalDigits));
}

function populateEntryFromResponse(entry, response, page) {
  const responseHeaders = response.headers;
  const cookieHeader = getHeaderValue(responseHeaders, 'Set-Cookie');

  entry.response = {
    httpVersion: response.protocol,
    redirectURL: '',
    status: response.status,
    statusText: response.statusText,
    content: {
      mimeType: response.mimeType,
      size: 0
    },
    headersSize: -1,
    bodySize: -1,
    cookies: parseResponseCookies(cookieHeader),
    headers: parseHeaders(responseHeaders),
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
    if (!(response.pushStart > 0)) {
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
  entry.serverIPAddress = response.remoteIPAddress;

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
    // but fromDiskCache is still set to false. For those requestSentDelta will be negative.
    if (!entry.__servedFromCache) {
      // wallTime is not necessarily monotonic, timestamp is. So calculate startedDateTime from timestamp diffs.
      // (see https://cs.chromium.org/chromium/src/third_party/WebKit/Source/platform/network/ResourceLoadTiming.h?q=requestTime+package:%5Echromium$&dr=CSs&l=84)
      const entrySecs =
        page.__wallTime + (timing.requestTime - page.__timestamp);
      entry.startedDateTime = new Date(entrySecs * 1000).toISOString();

      const queuedMillis =
        (timing.requestTime - entry.__requestWillBeSentTime) * 1000;
      if (queuedMillis > 0) {
        entry.timings._queued = formatMillis(queuedMillis);
      }
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
}

module.exports = {
  harFromMessages(messages, options) {
    options = Object.assign({}, defaultOptions, options);

    const ignoredRequests = new Set(),
      rootFrameMappings = new Map();

    let pages = [],
      entries = [],
      currentPageId;

    for (const message of messages) {
      const params = message.params;

      switch (message.method) {
        case 'Page.frameStartedLoading':
        case 'Page.frameScheduledNavigation':
          {
            const frameId = params.frameId;
            const previousFrameId = entries.find(
              entry => entry.__frameId === frameId
            );

            if (rootFrameMappings.has(frameId) || previousFrameId) {
              // This is a sub frame, there's already a page for the root frame
              continue;
            }

            currentPageId = uuid();
            const page = {
              id: currentPageId,
              startedDateTime: '',
              title: '',
              pageTimings: {},
              __frameId: frameId
            };
            pages.push(page);
          }
          break;

        case 'Network.requestWillBeSent':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              ignoredRequests.add(params.requestId);
              continue;
            }
            const request = params.request;
            if (!isSupportedProtocol(request.url)) {
              ignoredRequests.add(params.requestId);
              continue;
            }
            const frameId =
              rootFrameMappings.get(params.frameId) || params.frameId;
            const page = pages.find(page => page.__frameId === frameId);
            if (!page) {
              debug(
                `Request will be sent with requestId ${params.requestId} that can't be mapped to any page.`
              );
              ignoredRequests.add(params.requestId);
              continue;
            }

            const cookieHeader = getHeaderValue(request.headers, 'Cookie');

            // Remove fragment, that's what Chrome does.
            const url = urlParser.parse(request.url, true);
            url.hash = null;

            const postData = parsePostData(
              getHeaderValue(request.headers, 'Content-Type'),
              request.postData
            );

            const req = {
              method: request.method,
              url: urlParser.format(url),
              queryString: toNameValuePairs(url.query),
              postData,
              headersSize: -1,
              bodySize: isEmpty(request.postData) ? 0 : request.postData.length,
              cookies: parseRequestCookies(cookieHeader),
              headers: parseHeaders(request.headers)
            };

            const entry = {
              cache: {},
              startedDateTime: '',
              __requestWillBeSentTime: params.timestamp,
              __wallTime: params.wallTime,
              __requestId: params.requestId,
              __frameId: params.frameId,
              _initialPriority: request.initialPriority,
              _priority: request.initialPriority,
              pageref: currentPageId,
              request: req,
              time: 0,
              _initiator_detail: JSON.stringify(params.initiator),
              _initiator_type: params.initiator.type
            };

            // The object initiator change according to its type
            switch (params.initiator.type) {
              case 'parser':
                {
                  entry._initiator = params.initiator.url;
                  entry._initiator_line = params.initiator.lineNumber + 1; // Because lineNumber is 0 based
                }
                break;

              case 'script':
                {
                  if (
                    params.initiator.stack &&
                    params.initiator.stack.callFrames.length > 0
                  ) {
                    const topCallFrame = params.initiator.stack.callFrames[0];
                    entry._initiator = topCallFrame.url;
                    entry._initiator_line = topCallFrame.lineNumber + 1; // Because lineNumber is 0 based
                    entry._initiator_column = topCallFrame.columnNumber + 1; // Because columnNumber is 0 based
                    entry._initiator_function_name = topCallFrame.functionName;
                    entry._initiator_script_id = topCallFrame.scriptId;
                  }
                }
                break;
            }

            if (params.redirectResponse) {
              const previousEntry = entries.find(
                entry => entry.__requestId === params.requestId
              );
              if (previousEntry) {
                previousEntry.__requestId += 'r';
                populateEntryFromResponse(
                  previousEntry,
                  params.redirectResponse,
                  page
                );
              } else {
                debug(
                  `Couldn't find original request for redirect response: ${params.requestId}`
                );
              }
            }

            entries.push(entry);

            // this is the first request for this page, so set timestamp of page.
            if (!page.__timestamp) {
              page.__wallTime = params.wallTime;
              page.__timestamp = params.timestamp;
              page.startedDateTime = new Date(
                params.wallTime * 1000
              ).toISOString();
              //epoch float64, eg 1440589909.59248
              // URL is better than blank, and it's what devtools uses.
              page.title = request.url;
            }

            // wallTime is not necessarily monotonic, timestamp is. So calculate startedDateTime from timestamp diffs.
            // (see https://cs.chromium.org/chromium/src/third_party/WebKit/Source/platform/network/ResourceLoadTiming.h?q=requestTime+package:%5Echromium$&dr=CSs&l=84)
            const entrySecs =
              page.__wallTime + (params.timestamp - page.__timestamp);
            entry.startedDateTime = new Date(entrySecs * 1000).toISOString();
          }
          break;

        case 'Network.requestServedFromCache':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }

            if (ignoredRequests.has(params.requestId)) {
              continue;
            }

            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );
            if (!entry) {
              debug(
                `Received requestServedFromCache for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            entry.__servedFromCache = true;
            entry.cache.beforeRequest = {
              lastAccess: '',
              eTag: '',
              hitCount: 0
            };
          }
          break;

        case 'Network.responseReceived':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }
            if (ignoredRequests.has(params.requestId)) {
              continue;
            }

            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );
            if (!entry) {
              debug(
                `Received network response for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            const frameId =
              rootFrameMappings.get(params.frameId) || params.frameId;
            const page = pages.find(page => page.__frameId === frameId);
            if (!page) {
              debug(
                `Received network response for requestId ${params.requestId} that can't be mapped to any page.`
              );
              continue;
            }

            try {
              populateEntryFromResponse(entry, params.response, page);
            } catch (e) {
              debug(
                `Error parsing response: ${JSON.stringify(
                  params,
                  undefined,
                  2
                )}`
              );
              throw e;
            }
          }
          break;

        case 'Network.dataReceived':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }
            if (ignoredRequests.has(params.requestId)) {
              continue;
            }

            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );
            if (!entry) {
              debug(
                `Received network data for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            entry.response.content.size += params.dataLength;
          }
          break;

        case 'Network.loadingFinished':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }
            if (ignoredRequests.has(params.requestId)) {
              ignoredRequests.delete(params.requestId);
              continue;
            }

            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );
            if (!entry) {
              debug(
                `Network loading finished for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            const timings = entry.timings;
            timings.receive = formatMillis(
              (params.timestamp - entry._requestTime) * 1000 -
                entry.__receiveHeadersEnd
            );
            entry.time =
              max(0, timings.blocked) +
              max(0, timings.dns) +
              max(0, timings.connect) +
              timings.send +
              timings.wait +
              timings.receive;

            // encodedDataLength will be -1 sometimes
            if (params.encodedDataLength >= 0) {
              const response = entry.response;

              response._transferSize = params.encodedDataLength;
              response.bodySize = params.encodedDataLength;

              if (isHttp1x(response.httpVersion) && response.headersSize > -1) {
                response.bodySize -= response.headersSize;
              }

              const compression = Math.max(
                0,
                response.content.size - response.bodySize
              );
              if (compression > 0) {
                response.content.compression = compression;
              }
            }
          }
          break;

        case 'Page.loadEventFired':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }

            const page = pages[pages.length - 1];

            if (params.timestamp && page.__timestamp) {
              page.pageTimings.onLoad = formatMillis(
                (params.timestamp - page.__timestamp) * 1000
              );
            }
          }
          break;

        case 'Page.domContentEventFired':
          {
            if (pages.length < 1) {
              //we haven't loaded any pages yet.
              continue;
            }

            const page = pages[pages.length - 1];

            if (params.timestamp && page.__timestamp) {
              page.pageTimings.onContentLoad = formatMillis(
                (params.timestamp - page.__timestamp) * 1000
              );
            }
          }
          break;

        case 'Page.frameAttached':
          {
            const frameId = params.frameId,
              parentId = params.parentFrameId;

            rootFrameMappings.set(frameId, parentId);

            let grandParentId = rootFrameMappings.get(parentId);
            while (grandParentId) {
              rootFrameMappings.set(frameId, grandParentId);
              grandParentId = rootFrameMappings.get(grandParentId);
            }
          }
          break;

        case 'Page.frameNavigated':
        case 'Page.frameStoppedLoading':
        case 'Page.frameClearedScheduledNavigation':
        case 'Page.frameDetached':
        case 'Page.frameResized':
          // ignore
          break;

        case 'Page.javascriptDialogOpening':
        case 'Page.javascriptDialogClosed':
        case 'Page.screencastFrame':
        case 'Page.screencastVisibilityChanged':
        case 'Page.colorPicked':
        case 'Page.interstitialShown':
        case 'Page.interstitialHidden':
          // ignore
          break;

        case 'Network.loadingFailed':
          {
            if (ignoredRequests.has(params.requestId)) {
              ignoredRequests.delete(params.requestId);
              continue;
            }

            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );
            if (!entry) {
              debug(
                `Network loading failed for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            // This could be due to incorrect domain name etc. Sad, but unfortunately not something that a HAR file can
            // represent.
            debug(
              `Failed to load url '${entry.request
                .url}' (canceled: ${params.canceled})`
            );
            entries = entries.filter(
              entry => entry.__requestId !== params.requestId
            );
          }
          break;

        case 'Network.webSocketCreated':
        case 'Network.webSocketFrameSent':
        case 'Network.webSocketFrameError':
        case 'Network.webSocketFrameReceived':
        case 'Network.webSocketClosed':
        case 'Network.webSocketHandshakeResponseReceived':
        case 'Network.webSocketWillSendHandshakeRequest':
          // ignore, sadly HAR file format doesn't include web sockets
          break;

        case 'Network.eventSourceMessageReceived':
          // ignore
          break;
        case 'Network.resourceChangedPriority':
          {
            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );

            if (!entry) {
              debug(
                `Received resourceChangedPriority for requestId ${params.requestId} with no matching request.`
              );
              continue;
            }

            entry._priority = message.params.newPriority;
          }
          break;

        default:
          debug(`Unhandled event: ${message.method}`);
          break;
      }
    }

    if (!options.includeResourcesFromDiskCache) {
      entries = entries.filter(
        entry => entry.cache.beforeRequest === undefined
      );
    }

    const deleteInternalProperties = o => {
      // __ properties are only for internal use, _ properties are custom properties for the HAR
      for (const prop in o) {
        if (prop.startsWith('__')) {
          delete o[prop];
        }
      }
      return o;
    };

    entries = entries
      .filter(entry => {
        if (!entry.response) {
          debug(`Dropping incomplete request: ${entry.request.url}`);
        }
        return entry.response;
      })
      .map(deleteInternalProperties);

    pages = pages.map(deleteInternalProperties);

    pages = pages.reduce((result, page, index) => {
      const hasEntry = entries.some(entry => entry.pageref === page.id);
      if (hasEntry) {
        result.push(page);
      } else {
        debug(`Skipping empty page: ${index + 1}`);
      }
      return result;
    }, []);

    const pagerefMapping = pages.reduce((result, page, index) => {
      result[page.id] = `page_${index + 1}`;
      return result;
    }, {});

    pages = pages.map(page => {
      page.id = pagerefMapping[page.id];
      return page;
    });

    entries = entries.map(entry => {
      entry.pageref = pagerefMapping[entry.pageref];
      return entry;
    });

    // FIXME sanity check if there are any pages/entries created

    return {
      log: {
        version: '1.2',
        creator: { name, version, comment: homepage },
        pages,
        entries
      }
    };
  }
};

function toNameValuePairs(object) {
  return Object.keys(object).reduce((result, name) => {
    const value = object[name];
    if (Array.isArray(value)) {
      return result.concat(
        value.map(v => {
          return { name, value: v };
        })
      );
    } else {
      return result.concat([{ name, value }]);
    }
  }, []);
}

function parseUrlEncoded(data) {
  const params = urlParser.parse(`?${data}`, true).query;
  return toNameValuePairs(params);
}

function parsePostData(contentType, postData) {
  if (isEmpty(contentType) || isEmpty(postData)) {
    return undefined;
  }

  try {
    if (/^application\/x-www-form-urlencoded/.test(contentType)) {
      return {
        mimeType: contentType,
        params: parseUrlEncoded(postData)
      };
    }
    if (/^application\/json/.test(contentType)) {
      return {
        mimeType: contentType,
        params: toNameValuePairs(JSON.parse(postData))
      };
    }
    // FIXME parse multipart/form-data as well.
  } catch (e) {
    debug(`Unable to parse post data '${postData}' of type ${contentType}`);
    // Fall back to include postData as text.
  }

  return {
    mimeType: contentType,
    text: postData
  };
}

function isSupportedProtocol(url) {
  return /^https?:/.test(url);
}

function isHttp1x(version) {
  return version.toLowerCase().startsWith('http/1.');
}

function firstNonNegative(values) {
  for (let i = 0; i < values.length; ++i) {
    if (values[i] >= 0) return values[i];
  }
  return -1;
}
