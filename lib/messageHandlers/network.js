/* eslint-disable unicorn/no-null */

import { parse, format } from 'node:url';
import { getHeaderValue, parseHeaders } from '../helpers/headers.js';
import { parseRequestCookies, formatCookie } from '../helpers/cookies.js';
import {
  formatMillis,
  parsePostData,
  isSupportedProtocol,
  toNameValuePairs
} from '../helpers/util.js';
import { populateRedirectResponse } from '../redirectResponse.js';
import { addFromFirstRequest } from '../addFromFirstRequest.js';
import { entryFromResponse } from '../entryFromResponse.js';
import { finaliseEntry } from '../finaliseEntry.js';

/**
 * Handle Network.* events
 *
 * @param {string} method
 * @param {object} params
 * @param {object} state
 * @param {object} options
 * @param {Function} log
 * @returns {boolean} - true if handled, else false
 */
export function handleNetworkMessage(method, params, state, options, log) {
  const {
    pages,
    entries,
    entriesWithoutPage,
    responsesWithoutPage,
    paramsWithoutPage,
    responseReceivedExtraInfos,
    ignoredRequests,
    rootFrameMappings,
    currentPageId
  } = state;

  switch (method) {
    case 'Network.requestWillBeSent': {
      const { request } = params;
      if (!isSupportedProtocol(request.url)) {
        ignoredRequests.add(params.requestId);
        return true;
      }
      const page = pages.at(-1);
      const cookieHeader = getHeaderValue(request.headers, 'Cookie');

      // Keep URL fragment if present
      const fullUrl = request.url + (request.urlFragment ?? '');
      const urlObj = parse(fullUrl, true);
      const postData = parsePostData(
        getHeaderValue(request.headers, 'Content-Type'),
        request.postData
      );

      const req = {
        method: request.method,
        url: format(urlObj),
        queryString: toNameValuePairs(urlObj.query),
        postData,
        headersSize: -1,
        bodySize: request.postData ? request.postData.length : 0,
        cookies: parseRequestCookies(cookieHeader),
        headers: parseHeaders(request.headers)
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
        _resourceType: params.type ? params.type.toLowerCase() : null
      };

      // Handle initiator details
      switch (params.initiator.type) {
        case 'parser': {
          entry._initiator = params.initiator.url;
          entry._initiator_line = params.initiator.lineNumber + 1;
          break;
        }
        case 'script': {
          if (params.initiator.stack?.callFrames?.length > 0) {
            const topCallFrame = params.initiator.stack.callFrames[0];
            entry._initiator = topCallFrame.url;
            entry._initiator_line = topCallFrame.lineNumber + 1;
            entry._initiator_column = topCallFrame.columnNumber + 1;
            entry._initiator_function_name = topCallFrame.functionName;
            entry._initiator_script_id = topCallFrame.scriptId;
          }
          break;
        }
        // no default
      }

      // If there's a redirectResponse, attach it to the old request
      if (params.redirectResponse && page) {
        populateRedirectResponse(page, params, entries, options, log);
      }

      if (!page) {
        // We haven't created a page yet, store these "offline"
        entriesWithoutPage.push(entry);
        paramsWithoutPage.push(params);
        log(
          `Request will be sent but no page is mapped yet: requestId=${params.requestId}`
        );
        return true;
      }

      // Otherwise, we have a page. Let’s attach it right away
      entries.push(entry);
      addFromFirstRequest(page, params);

      // startedDateTime in ISO string
      const entrySecs = page.__wallTime + (params.timestamp - page.__timestamp);
      entry.startedDateTime = new Date(entrySecs * 1000).toISOString();

      return true;
    }

    case 'Network.requestServedFromCache': {
      if (pages.length === 0) {
        return true;
      }
      if (ignoredRequests.has(params.requestId)) {
        return true;
      }
      const entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        log(
          `requestServedFromCache with no matching request: ${params.requestId}`
        );
        return true;
      }
      entry.__servedFromCache = true;
      entry.cache.beforeRequest = {
        lastAccess: '',
        eTag: '',
        hitCount: 0
      };
      return true;
    }

    case 'Network.requestWillBeSentExtraInfo': {
      if (ignoredRequests.has(params.requestId)) {
        return true;
      }
      const entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        log(
          `Extra info for requestId=${params.requestId}, but no matching entry.`
        );
        return true;
      }
      if (params.headers) {
        const extraHeaders = parseHeaders(params.headers);
        entry.request.headers.push(...extraHeaders);
      }
      if (params.associatedCookies) {
        const validCookies = params.associatedCookies
          .filter(({ blockedReasons }) => blockedReasons.length === 0)
          .map(({ cookie }) => formatCookie(cookie));
        entry.request.cookies.push(...validCookies);
      }
      return true;
    }

    case 'Network.responseReceivedExtraInfo': {
      if (pages.length === 0) {
        return true;
      }
      if (ignoredRequests.has(params.requestId)) {
        return true;
      }
      let entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        entry = entriesWithoutPage.find(e => e._requestId === params.requestId);
      }
      if (!entry) {
        // Save it for later if we don't have an entry yet
        responseReceivedExtraInfos.push(params);
        return true;
      }

      // If we don't have a response yet, store this extra info
      if (!entry.response) {
        entry.extraResponseInfo = {
          headers: parseHeaders(params.headers),
          blockedCookies: params.blockedCookies
        };
        responseReceivedExtraInfos.push(params);
        return true;
      }

      // If we already have entry.response, update with these new headers
      if (params.headers) {
        entry.response.headers = parseHeaders(params.headers);
      }
      return true;
    }

    case 'Network.responseReceived': {
      if (pages.length === 0) {
        // We haven't loaded any pages yet, store for later
        responsesWithoutPage.push(params);
        return true;
      }
      if (ignoredRequests.has(params.requestId)) {
        return true;
      }

      let entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        entry = entriesWithoutPage.find(e => e._requestId === params.requestId);
      }
      if (!entry) {
        log(
          `Network.responseReceived but no matching request: ${params.requestId}`
        );
        return true;
      }
      const frameId = rootFrameMappings.get(params.frameId) ?? params.frameId;
      const page = pages.find(p => p.__frameId === frameId) || pages.at(-1);

      if (!page) {
        log(
          `responseReceived for requestId=${params.requestId}, but no page found`
        );
        return true;
      }

      // Actually attach the response data
      try {
        entryFromResponse(entry, params.response, page, options);
      } catch (error) {
        log(`Error in entryFromResponse: ${error.message}`);
      }

      // If we had extraInfo queued up, merge it
      const extraInfo = responseReceivedExtraInfos.find(
        info => info.requestId === params.requestId
      );
      if (extraInfo?.headers) {
        entry.response.headers = parseHeaders(extraInfo.headers);
      }
      return true;
    }

    case 'Network.dataReceived': {
      if (pages.length === 0) {
        return true;
      }
      if (ignoredRequests.has(params.requestId)) {
        return true;
      }
      const entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        log(
          `dataReceived for requestId=${params.requestId}, but no entry found`
        );
        return true;
      }
      if (entry.response) {
        entry.response.content.size += params.dataLength;
      }

      const page = pages.find(p => p.id === entry.pageref);
      if (page) {
        const tsMs = (params.timestamp - page.__timestamp) * 1000;
        const chunk = {
          ts: formatMillis(tsMs),
          bytes: params.dataLength
        };
        if (entry._chunks) {
          entry._chunks.push(chunk);
        } else {
          entry._chunks = [chunk];
        }
      }
      return true;
    }

    case 'Network.loadingFinished': {
      if (pages.length === 0) {
        return true;
      }
      if (ignoredRequests.has(params.requestId)) {
        ignoredRequests.delete(params.requestId);
        return true;
      }
      const entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        log(`loadingFinished with no matching request: ${params.requestId}`);
        return true;
      }
      finaliseEntry(entry, params);
      return true;
    }

    case 'Network.loadingFailed': {
      if (ignoredRequests.has(params.requestId)) {
        ignoredRequests.delete(params.requestId);
        return true;
      }
      const entryIndex = entries.findIndex(
        e => e._requestId === params.requestId
      );
      if (entryIndex === -1) {
        log(
          `Network.loadingFailed but no matching request: ${params.requestId}`
        );
        return true;
      }

      const entry = entries[entryIndex];
      if (params.errorText === 'net::ERR_ABORTED') {
        // Keep the entry, but finalize it
        finaliseEntry(entry, params);
        log(
          `Loading was canceled (ERR_ABORTED) for requestId=${params.requestId}.`
        );
      } else {
        // Remove the entry because it failed to load
        log(
          `Failed to load url '${entry.request.url}' (canceled=${params.canceled}).`
        );
        entries.splice(entryIndex, 1);
      }
      return true;
    }

    case 'Network.resourceChangedPriority': {
      const entry = entries.find(e => e._requestId === params.requestId);
      if (!entry) {
        log(
          `resourceChangedPriority but no matching request: ${params.requestId}`
        );
        return true;
      }
      entry._priority = params.newPriority;
      return true;
    }

    default: {
      return false;
    }
  }
}
