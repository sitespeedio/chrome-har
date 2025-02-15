import debug from 'debug';
import { entryFromResponse } from './entryFromResponse.js';

const log = debug('chrome-har');

/**
 * Attach the redirectResponse to the old request entry
 */
export function populateRedirectResponse(
  page,
  params,
  entries,
  options,
  customLog = log
) {
  const previousEntry = entries.find(
    entry => entry._requestId === params.requestId
  );
  if (previousEntry) {
    previousEntry._requestId += 'r';
    entryFromResponse(previousEntry, params.redirectResponse, page, options);
  } else {
    customLog(
      `Couldn't find original request for redirect response: ${params.requestId}`
    );
  }
}
