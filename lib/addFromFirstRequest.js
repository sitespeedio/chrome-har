/**
 * Set up the page timestamps/title from the first request
 */
export function addFromFirstRequest(page, params) {
  if (!page.__timestamp) {
    page.__wallTime = params.wallTime;
    page.__timestamp = params.timestamp;
    page.startedDateTime = new Date(params.wallTime * 1000).toISOString();
    // If the page has no title, default to the request URL
    page.title = page.title === '' ? params.request.url : page.title;
  }
}
