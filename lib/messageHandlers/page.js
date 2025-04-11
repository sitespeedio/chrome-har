import { randomUUID } from 'node:crypto';
import { addFromFirstRequest } from '..//addFromFirstRequest.js';
import { populateRedirectResponse } from '../redirectResponse.js';
import { entryFromResponse } from '../entryFromResponse.js';
import { formatMillis } from '../helpers/util.js';

/**
 * Handle Page.* events
 *
 * @param {string} method - e.g. "Page.frameStartedLoading"
 * @param {object} params - The parameters from the DevTools protocol
 * @param {object} state - The shared "har" state
 * @param {object} options - Merged user options
 * @param {Function} log - Debug logger
 * @returns {boolean} - true if the event was handled, false otherwise
 */
export function handlePageMessage(method, params, state, options, log) {
  const {
    pages,
    entries,
    entriesWithoutPage,
    responsesWithoutPage,
    paramsWithoutPage,
    rootFrameMappings
  } = state;

  switch (method) {
    case 'Page.frameStartedLoading':
    case 'Page.frameRequestedNavigation':
    case 'Page.navigatedWithinDocument': {
      const { frameId } = params;
      const rootFrame = rootFrameMappings.get(frameId) ?? frameId;

      // If we already have a page for this frame, skip
      if (pages.some(p => p.__frameId === rootFrame)) {
        return true;
      }

      state.currentPageId = randomUUID();
      const title = method === 'Page.navigatedWithinDocument' ? params.url : '';

      const page = {
        id: state.currentPageId,
        startedDateTime: '',
        title,
        pageTimings: {},
        __frameId: rootFrame
      };
      pages.push(page);

      // If we had requests waiting for a page, attach them
      if (entriesWithoutPage.length > 0) {
        for (const entry of entriesWithoutPage) {
          entry.pageref = page.id;
        }
        entries.push(...entriesWithoutPage);
        addFromFirstRequest(page, paramsWithoutPage[0]);

        for (const param of paramsWithoutPage) {
          if (param.redirectResponse) {
            populateRedirectResponse(page, param, entries, options, log);
          }
        }
      }

      if (responsesWithoutPage.length > 0) {
        for (const r of responsesWithoutPage) {
          const matchingEntry = entries.find(e => e._requestId === r.requestId);
          if (matchingEntry) {
            try {
              entryFromResponse(matchingEntry, r.response, page, options);
            } catch (error) {
              log(`Error parsing response (Page.* leftover): ${error.message}`);
            }
          } else {
            log(`Couldn't find matching request for a leftover response.`);
          }
        }
      }

      return true;
    }

    case 'Page.loadEventFired': {
      // Called when load event is triggered (Document + subresources are loaded)
      if (pages.length === 0) {
        return true;
      }
      const page = pages.at(-1);
      if (params.timestamp && page.__timestamp) {
        const ms = (params.timestamp - page.__timestamp) * 1000;
        page.pageTimings.onLoad = formatMillis(ms);
      }
      return true;
    }

    case 'Page.domContentEventFired': {
      // Called when DOMContentLoaded is fired
      if (pages.length === 0) {
        return true;
      }
      const page = pages.at(-1);
      if (params.timestamp && page.__timestamp) {
        const ms = (params.timestamp - page.__timestamp) * 1000;
        page.pageTimings.onContentLoad = formatMillis(ms);
      }
      return true;
    }

    case 'Page.frameAttached': {
      const { frameId, parentFrameId } = params;
      rootFrameMappings.set(frameId, parentFrameId);

      let grandParentId = rootFrameMappings.get(parentFrameId);
      while (grandParentId) {
        rootFrameMappings.set(frameId, grandParentId);
        grandParentId = rootFrameMappings.get(grandParentId);
      }

      return true;
    }

    default: {
      return false;
    }
  }
}
