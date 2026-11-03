import { format } from 'node:util';

export function calculateRequestHeaderSize(harRequest) {
  let buffer = format(
    '%s %s %s\r\n',
    harRequest.method,
    harRequest.url,
    harRequest.httpVersion
  );

  const headerLines = harRequest.headers.map(header =>
    format('%s: %s\r\n', header.name, header.value)
  );
  buffer = buffer.concat(headerLines.join(''));
  buffer = buffer.concat('\r\n');

  return buffer.length;
}
export function calculateResponseHeaderSize(perflogResponse) {
  let buffer = format(
    '%s %d %s\r\n',
    perflogResponse.protocol,
    perflogResponse.status,
    perflogResponse.statusText
  );
  for (const key of Object.keys(perflogResponse.headers)) {
    buffer = buffer.concat(
      format('%s: %s\r\n', key, perflogResponse.headers[key])
    );
  }
  buffer = buffer.concat('\r\n');

  return buffer.length;
}
export function parseHeaders(headers) {
  if (!headers) {
    return [];
  }
  return Object.keys(headers).map(key => {
    return {
      name: key,
      value: headers[key]
    };
  });
}
// Extra info headers win, but keep the headers that only Chrome's renderer has
export function mergeHeaders(harHeaders, extraHeaders) {
  const extra = parseHeaders(extraHeaders);
  const extraNames = new Set(extra.map(header => header.name.toLowerCase()));
  return harHeaders
    .filter(header => !extraNames.has(header.name.toLowerCase()))
    .concat(extra);
}
export function getHeaderValue(headers, header) {
  if (!headers) {
    return '';
  }
  // http header names are case insensitive
  const lowerCaseHeader = header.toLowerCase();
  const headerNames = Object.keys(headers);
  return (
    headerNames
      .filter(key => key.toLowerCase() === lowerCaseHeader)
      .map(key => headers[key])
      .shift() || ''
  );
}
