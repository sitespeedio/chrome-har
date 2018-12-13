'use strict';

const { name, version, homepage } = require('./package');

const urlParser = require('url');
const uuid = require('uuid/v1');
const dayjs = require('dayjs');
const debug = require('debug')(name);
const ignoredEvents = require('./lib/ignoredEvents');
const { parseRequestCookies } = require('./lib/cookies');
const { getHeaderValue, parseHeaders } = require('./lib/headers');
const {
  isHttp1x,
  formatMillis,
  parsePostData,
  isSupportedProtocol,
  toNameValuePairs
} = require('./lib/util');
const populateEntryFromResponse = require('./lib/entryFromResponse');

const defaultOptions = {
  includeResourcesFromDiskCache: false
};
const isEmpty = o => !o;

const max = Math.max;

function addFromFirstRequest(page, params) {
  if (!page.__timestamp) {
    page.__wallTime = params.wallTime;
    page.__timestamp = params.timestamp;
    page.startedDateTime = dayjs.unix(params.wallTime).toISOString(); //epoch float64, eg 1440589909.59248
    // URL is better than blank, and it's what devtools uses.
    page.title = page.title === '' ? params.request.url : page.title;
  }
}

module.exports = {
  harFromMessages(messages, options) {
    options = Object.assign({}, defaultOptions, options);

    const ignoredRequests = new Set(),
      rootFrameMappings = new Map();

    let pages = [],
      entries = [],
      entriesWithoutPage = [],
      responsesWithoutPage = [],
      paramsWithoutPage = [],
      currentPageId;

    for (const message of messages) {
      const params = message.params;

      const method = message.method;

      if (!/^(Page|Network)\..+/.test(method)) {
        continue;
      }

      switch (method) {
        case 'Page.frameStartedLoading':
        case 'Page.frameScheduledNavigation':
        case 'Page.navigatedWithinDocument':
          {
            const frameId = params.frameId;

            const rootFrame = rootFrameMappings.get(frameId) || frameId;
            if (pages.some(page => page.__frameId === rootFrame)) {
              // Navigated from Browsertime
              if (params.reason !== 'scriptInitiated') {
                continue;
              } else if (
                // This is something we've seen on Aftonbladets splash screens
                params.reason === 'scriptInitiated' &&
                params.url === 'about:blank'
              ) {
                continue;
              }
            }
            currentPageId = uuid();
            const title =
              method === 'Page.navigatedWithinDocument' ? params.url : '';
            const page = {
              id: currentPageId,
              startedDateTime: '',
              title: title,
              pageTimings: {},
              __frameId: rootFrame
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
            }
            if (responsesWithoutPage.length > 0) {
              for (let params of responsesWithoutPage) {
                let entry = entries.find(
                  entry => entry.__requestId === params.requestId
                );
                if (entry) {
                  populateEntryFromResponse(entry, params.response, page);
                } else {
                  debug(`Couln't find matching request for response`);
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
                  `Couldn't find original request for redirect response: ${
                    params.requestId
                  }`
                );
              }
            }

            if (!page) {
              debug(
                `Request will be sent with requestId ${
                  params.requestId
                } that can't be mapped to any page at the moment.`
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
            entry.startedDateTime = dayjs.unix(entrySecs).toISOString();
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
                `Received requestServedFromCache for requestId ${
                  params.requestId
                } with no matching request.`
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
              responsesWithoutPage.push(params);
              continue;
            }

            if (ignoredRequests.has(params.requestId)) {
              continue;
            }

            let entry = entries.find(
              entry => entry.__requestId === params.requestId
            );

            if (!entry) {
              entry = entriesWithoutPage.find(
                entry => entry.__requestId === params.requestId
              );
            }
            if (!entry) {
              debug(
                `Received network response for requestId ${
                  params.requestId
                } with no matching request.`
              );
              continue;
            }

            const frameId =
              rootFrameMappings.get(params.frameId) || params.frameId;
            const page = pages.find(page => page.__frameId === frameId);
            if (!page) {
              debug(
                `Received network response for requestId ${
                  params.requestId
                } that can't be mapped to any page.`
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
                `Received network data for requestId ${
                  params.requestId
                } with no matching request.`
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
                `Network loading finished for requestId ${
                  params.requestId
                } with no matching request.`
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

            // For cached entries, Network.loadingFinished can have an earlier
            // timestamp than Network.dataReceived

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
                `Network loading failed for requestId ${
                  params.requestId
                } with no matching request.`
              );
              continue;
            }

            // This could be due to incorrect domain name etc. Sad, but unfortunately not something that a HAR file can
            // represent.
            debug(
              `Failed to load url '${entry.request.url}' (canceled: ${
                params.canceled
              })`
            );
            entries = entries.filter(
              entry => entry.__requestId !== params.requestId
            );
          }
          break;

        case 'Network.resourceChangedPriority':
          {
            const entry = entries.find(
              entry => entry.__requestId === params.requestId
            );

            if (!entry) {
              debug(
                `Received resourceChangedPriority for requestId ${
                  params.requestId
                } with no matching request.`
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
