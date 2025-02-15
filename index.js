import { createRequire } from 'node:module';
import debug from 'debug';

import { handlePageMessage } from './lib/messageHandlers/page.js';
import { handleNetworkMessage } from './lib/messageHandlers/network.js';
import { buildHar } from './lib/buildHar.js';
import { ignoreEvents } from './lib/ignoredEvents.js';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');
const log = debug('chrome-har');

const defaultOptions = {
  includeResourcesFromDiskCache: false,
  includeTextFromResponseBody: false
};

/**
 * Main function that takes an array of DevTools protocol messages
 * and returns a HAR object.
 *
 * @param {Array} messages - DevTools protocol messages
 * @param {object} [options] - Optional configuration
 * @returns {object} The final HAR
 */
export function harFromMessages(messages, options = {}) {
  const mergedOptions = {
    ...defaultOptions,
    ...options
  };

  // Shared state object that we pass around
  const state = {
    pages: [],
    entries: [],
    entriesWithoutPage: [],
    responsesWithoutPage: [],
    paramsWithoutPage: [],
    responseReceivedExtraInfos: [],
    ignoredRequests: new Set(),
    rootFrameMappings: new Map(),
    currentPageId: undefined
  };

  for (const message of messages) {
    const { method, params } = message;

    if (!/^(Page|Network)\./u.test(method)) {
      // Not a Page.* or Network.* event—ignore
      continue;
    }

    let handled = false;
    if (method.startsWith('Page.')) {
      handled = handlePageMessage(method, params, state, mergedOptions, log);
    } else if (method.startsWith('Network.')) {
      handled = handleNetworkMessage(method, params, state, mergedOptions, log);
    }

    if (!handled) {
      // The event wasn't handled by either Page or Network logic
      ignoreEvents(method);
    }
  }

  // Finally, build and return the HAR
  return buildHar(state, version, mergedOptions, log);
}
