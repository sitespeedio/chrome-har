import { formatMillis } from './helpers/util.js';

/**
 * Builds the final HAR from the parsing state
 *
 * @param {object} state - Contains pages, entries, etc.
 * @param {string} version - The package version from package.json
 * @param {object} options - Merged user options
 * @param {Function} log - The debug logger
 * @returns {object} The final HAR object
 */
export function buildHar(state, version, options, log) {
  let { pages, entries } = state;

  // Filter out disk-cache resources if the user doesn't want them
  if (!options.includeResourcesFromDiskCache) {
    entries = entries.filter(entry => entry.cache.beforeRequest === undefined);
  }

  // Drop incomplete requests that never had a response
  entries = entries.filter(entry => {
    if (!entry.response) {
      log(`Dropping incomplete request: ${entry.request?.url}`);
      return false;
    }
    return true;
  });

  // Remove internal props (those starting with "__")
  for (const entry of entries) {
    removeInternalProperties(entry);
  }
  for (const page of pages) {
    removeInternalProperties(page);
  }

  // Remove empty pages (those with no matching entries)
  pages = pages.reduce((acc, page, index) => {
    const hasEntry = entries.some(entry => entry.pageref === page.id);
    if (!hasEntry) {
      log(`Skipping empty page: ${index + 1}`);
      return acc;
    }
    acc.push(page);
    return acc;
  }, []);

  // Map internal page IDs (UUIDs) to "page_1", "page_2", etc.
  const pageRefMapping = {};
  for (const [index, page] of pages.entries()) {
    pageRefMapping[page.id] = `page_${index + 1}`;
  }

  // Rewrite the page IDs
  for (const page of pages) {
    page.id = pageRefMapping[page.id];
  }
  // Rewrite each entry's pageref
  for (const entry of entries) {
    entry.pageref = pageRefMapping[entry.pageref];
  }

  // Format final page timings (in ms strings, if that is needed)
  // If your tests expect numeric or string, adjust accordingly.
  for (const page of pages) {
    if (typeof page.pageTimings.onLoad === 'number') {
      page.pageTimings.onLoad = formatMillis(page.pageTimings.onLoad);
    }
    if (typeof page.pageTimings.onContentLoad === 'number') {
      page.pageTimings.onContentLoad = formatMillis(
        page.pageTimings.onContentLoad
      );
    }
  }

  return {
    log: {
      version: '1.2',
      creator: {
        name: 'chrome-har',
        version,
        comment: 'https://github.com/sitespeedio/chrome-har'
      },
      pages,
      entries
    }
  };
}

function removeInternalProperties(object_) {
  for (const key of Object.keys(object_)) {
    if (key.startsWith('__')) {
      delete object_[key];
    }
  }
  return object_;
}
