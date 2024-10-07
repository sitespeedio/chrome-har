import { parse, format } from 'url';
import { randomUUID } from 'crypto';
import { createRequire } from 'node:module';
import debug from 'debug';
import ignoredEvents from './lib/ignoredEvents.js';
import { parseRequestCookies, formatCookie } from './lib/cookies.js';
import { getHeaderValue, parseHeaders } from './lib/headers.js';
import {
  formatMillis,
  parsePostData,
  isSupportedProtocol,
  toNameValuePairs,
} from './lib/util.js';
import populateEntryFromResponse from './lib/entryFromResponse.js';
import finalizeEntry from './lib/finalizeEntry.js';

const require = createRequire(import.meta.url);
const version = require('./package.json').version;
const log = debug('chrome-har');

const defaultOptions = {
  includeResourcesFromDiskCache: false,
  includeTextFromResponseBody: false,
};
const isEmpty = (o) => !o;

function addFromFirstRequest(page, params) {
  if (!page.__timestamp) {
    page.__wallTime = params.wallTime;
    page.__timestamp = params.timestamp;
    page.startedDateTime = new Date(params.wallTime * 1000).toISOString();
    // URL is better than blank, and it's what devtools uses.
    page.title = page.title === '' ? params.request.url : page.title;
  }
}

function populateRedirectResponse(page, params, entries, options) {
  const previousEntry = entries.find(
    (entry) => entry._requestId === params.requestId,
  );
  if (previousEntry) {
    previousEntry._requestId += 'r';
    populateEntryFromResponse(
      previousEntry,
      params.redirectResponse,
      page,
      options,
    );
  } else {
    log(
      `Couldn't find original request for redirect response: ${
        params.requestId
      }`,
    );
  }
}

export function harFromMessages(messages, options) {
  options = Object.assign({}, defaultOptions, options);

  const ignoredRequests = new Set(),
    rootFrameMappings = new Map();

  let pages = [],
    entries = [],
    entriesWithoutPage = [],
    responsesWithoutPage = [],
    paramsWithoutPage = [],
    responseReceivedExtraInfos = [],
    currentPageId;

  for (const message of messages) {
    const params = message.params;

    const method = message.method;

    if (!/^(Page|Network)\..+/.test(method)) {
      continue;
    }

    switch (method) {
      case 'Page.frameStartedLoading':
      case 'Page.frameRequestedNavigation':
      case 'Page.navigatedWithinDocument':
        {
          const frameId = params.frameId;
          const rootFrame = rootFrameMappings.get(frameId) || frameId;
          if (pages.some((page) => page.__frameId === rootFrame)) {
            continue;
          }
          currentPageId = randomUUID();
          const title =
            method === 'Page.navigatedWithinDocument' ? params.url : '';
          const page = {
            id: currentPageId,
            startedDateTime: '',
            title: title,
            pageTimings: {},
            __frameId: rootFrame,
          };
          pages.push(page);
          // do we have any unmmapped requests, add them
          if (entriesWithoutPage.length > 0) {
            // update page
            for (let entry of entriesWithoutPage) {
              entry.pageref = page.id;
            }
            entries = entries.concat(entriesWithoutPage);
            addFromFirstRequest(page, paramsWithoutPage[0]);

            // Add unmapped redirects
            for (let params of paramsWithoutPage) {
              if (params.redirectResponse) {
                populateRedirectResponse(page, params, entries, options);
              }
            }
          }

          if (responsesWithoutPage.length > 0) {
            for (let params of responsesWithoutPage) {
              let entry = entries.find(
                (entry) => entry._requestId === params.requestId,
              );
              if (entry) {
                populateEntryFromResponse(
                  entry,
                  params.response,
                  page,
                  options,
                );
              } else {
                log(`Couln't find matching request for response`);
              }
            }
          }
        }
        break;

      case 'Network.requestWillBeSent':
        {
          const request = params.request;
          if (!isSupportedProtocol(request.url)) {
            ignoredRequests.add(params.requestId);
            continue;
          }
          const page = pages[pages.length - 1];
          const cookieHeader = getHeaderValue(request.headers, 'Cookie');

          //Before we used to remove the hash framgment because of Chrome do that but:
          // 1. Firefox do not
          // 2. If we remove it, the HAR will not have the same URL as we tested
          // and that makes PageXray generate the wromng URL and we end up with two pages
          // in sitespeed.io if we run in SPA mode
          const url = parse(
            request.url + (request.urlFragment ? request.urlFragment : ''),
            true,
          );

          const postData = parsePostData(
            getHeaderValue(request.headers, 'Content-Type'),
            request.postData,
          );

          const req = {
            method: request.method,
            url: format(url),
            queryString: toNameValuePairs(url.query),
            postData,
            headersSize: -1,
            bodySize: isEmpty(request.postData) ? 0 : request.postData.length,
            cookies: parseRequestCookies(cookieHeader),
            headers: parseHeaders(request.headers),
          };

          if (request.isLinkPreload) {
            req._isLinkPreload = true;
          }

          const entry = {
            cache: {},
            startedDateTime: '',
            __requestWillBeSentTime: params.timestamp,
            __wallTime: params.wallTime,
            _requestId: params.requestId,
            __frameId: params.frameId,
            _initialPriority: request.initialPriority,
            _priority: request.initialPriority,
            pageref: currentPageId,
            request: req,
            time: 0,
            _initiator_detail: JSON.stringify(params.initiator),
            _initiator_type: params.initiator.type,
            // Chrome's DevTools Frontend returns this field in lower case
            _resourceType: params.type ? params.type.toLowerCase() : null,
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
            populateRedirectResponse(page, params, entries, options);
          }

          if (!page) {
            log(
              `Request will be sent with requestId ${params.requestId} that can't be mapped to any page at the moment.`,
            );
            // ignoredRequests.add(params.requestId);
            entriesWithoutPage.push(entry);
            paramsWithoutPage.push(params);
            continue;
          }

          entries.push(entry);

          // this is the first request for this page, so set timestamp of page.
          addFromFirstRequest(page, params);
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
            (entry) => entry._requestId === params.requestId,
          );
          if (!entry) {
            log(
              `Received requestServedFromCache for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          entry.__servedFromCache = true;
          entry.cache.beforeRequest = {
            lastAccess: '',
            eTag: '',
            hitCount: 0,
          };
        }
        break;

      case 'Network.requestWillBeSentExtraInfo':
        {
          if (ignoredRequests.has(params.requestId)) {
            continue;
          }

          const entry = entries.find(
            (entry) => entry._requestId === params.requestId,
          );
          if (!entry) {
            log(
              `Extra info sent for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          if (params.headers) {
            entry.request.headers = entry.request.headers.concat(
              parseHeaders(params.headers),
            );
          }

          if (params.associatedCookies) {
            entry.request.cookies = (entry.request.cookies || []).concat(
              params.associatedCookies
                .filter(({ blockedReasons }) => !blockedReasons.length)
                .map(({ cookie }) => formatCookie(cookie)),
            );
          }
        }
        break;

      case 'Network.responseReceivedExtraInfo':
        {
          if (pages.length < 1) {
            //we haven't loaded any pages yet.
            continue;
          }

          if (ignoredRequests.has(params.requestId)) {
            continue;
          }

          let entry = entries.find(
            (entry) => entry._requestId === params.requestId,
          );

          if (!entry) {
            entry = entriesWithoutPage.find(
              (entry) => entry._requestId === params.requestId,
            );
          }

          if (!entry) {
            responseReceivedExtraInfos.push(params);
            continue;
          }

          if (!entry.response) {
            // Extra info received before response
            entry.extraResponseInfo = {
              headers: parseHeaders(params.headers),
              blockedCookies: params.blockedCookies,
            };
            responseReceivedExtraInfos.push(params);
            continue;
          }

          if (params.headers) {
            entry.response.headers = parseHeaders(params.headers);
          }
        }
        break;

      case 'Network.responseReceived':
        {
          if (pages.length < 1) {
            //we haven't loaded any pages yet.
            responsesWithoutPage.push(params);
            continue;
          }

          if (ignoredRequests.has(params.requestId)) {
            continue;
          }

          let entry = entries.find(
            (entry) => entry._requestId === params.requestId,
          );

          if (!entry) {
            entry = entriesWithoutPage.find(
              (entry) => entry._requestId === params.requestId,
            );
          }

          if (!entry) {
            log(
              `Received network response for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          const frameId =
            rootFrameMappings.get(params.frameId) || params.frameId;
          const page =
            pages.find((page) => page.__frameId === frameId) ||
            pages[pages.length - 1];
          if (!page) {
            log(
              `Received network response for requestId ${params.requestId} that can't be mapped to any page.`,
            );
            continue;
          }

          try {
            populateEntryFromResponse(entry, params.response, page, options);
          } catch (e) {
            log(
              `Error parsing response: ${JSON.stringify(params, undefined, 2)}`,
            );
            throw e;
          }

          const responseReceivedExtraInfo = responseReceivedExtraInfos.find(
            (responseReceivedExtraInfo) =>
              responseReceivedExtraInfo.requestId == params.requestId,
          );
          if (responseReceivedExtraInfo && responseReceivedExtraInfo.headers) {
            entry.response.headers = parseHeaders(
              responseReceivedExtraInfo.headers,
            );
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
            (entry) => entry._requestId === params.requestId,
          );
          if (!entry) {
            log(
              `Received network data for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }
          // It seems that people sometimes have an entry without a response,
          // I wonder how that works
          // https://github.com/sitespeedio/sitespeed.io/issues/2645
          if (entry.response) {
            entry.response.content.size += params.dataLength;
          }

          const page = pages.find((page) => page.id === entry.pageref);

          if (entry._chunks && page) {
            entry._chunks.push({
              ts: formatMillis((params.timestamp - page.__timestamp) * 1000),
              bytes: params.dataLength,
            });
          } else if (page) {
            entry._chunks = [
              {
                ts: formatMillis((params.timestamp - page.__timestamp) * 1000),
                bytes: params.dataLength,
              },
            ];
          }
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
            (entry) => entry._requestId === params.requestId,
          );
          if (!entry) {
            log(
              `Network loading finished for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          finalizeEntry(entry, params);
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
              (params.timestamp - page.__timestamp) * 1000,
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
              (params.timestamp - page.__timestamp) * 1000,
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

      case 'Network.loadingFailed':
        {
          if (ignoredRequests.has(params.requestId)) {
            ignoredRequests.delete(params.requestId);
            continue;
          }

          const entry = entries.find(
            (entry) => entry._requestId === params.requestId,
          );
          if (!entry) {
            log(
              `Network loading failed for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          if (params.errorText === 'net::ERR_ABORTED') {
            finalizeEntry(entry, params);
            log(
              `Loading was canceled due to Chrome or a user action for requestId ${params.requestId}.`,
            );
            continue;
          }

          // This could be due to incorrect domain name etc. Sad, but unfortunately not something that a HAR file can
          // represent.
          log(
            `Failed to load url '${entry.request.url}' (canceled: ${params.canceled})`,
          );
          entries = entries.filter(
            (entry) => entry._requestId !== params.requestId,
          );
        }
        break;

      case 'Network.resourceChangedPriority':
        {
          const entry = entries.find(
            (entry) => entry._requestId === params.requestId,
          );

          if (!entry) {
            log(
              `Received resourceChangedPriority for requestId ${params.requestId} with no matching request.`,
            );
            continue;
          }

          entry._priority = message.params.newPriority;
        }
        break;

      default:
        // Keep the old functionallity and log unknown events
        ignoredEvents(method);
        break;
    }
  }

  if (!options.includeResourcesFromDiskCache) {
    entries = entries.filter(
      (entry) => entry.cache.beforeRequest === undefined,
    );
  }

  const deleteInternalProperties = (o) => {
    // __ properties are only for internal use, _ properties are custom properties for the HAR
    for (const prop in o) {
      if (prop.startsWith('__')) {
        delete o[prop];
      }
    }
    return o;
  };

  entries = entries
    .filter((entry) => {
      if (!entry.response) {
        log(`Dropping incomplete request: ${entry.request.url}`);
      }
      return entry.response;
    })
    .map(deleteInternalProperties);
  pages = pages.map(deleteInternalProperties);
  pages = pages.reduce((result, page, index) => {
    const hasEntry = entries.some((entry) => entry.pageref === page.id);
    if (hasEntry) {
      result.push(page);
    } else {
      log(`Skipping empty page: ${index + 1}`);
    }
    return result;
  }, []);
  const pagerefMapping = pages.reduce((result, page, index) => {
    result[page.id] = `page_${index + 1}`;
    return result;
  }, {});

  pages = pages.map((page) => {
    page.id = pagerefMapping[page.id];
    return page;
  });
  entries = entries.map((entry) => {
    entry.pageref = pagerefMapping[entry.pageref];
    return entry;
  });

  // FIXME sanity check if there are any pages/entries created
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'chrome-har',
        version,
        comment: 'https://github.com/sitespeedio/chrome-har',
      },
      pages,
      entries,
    },
  };
}
