import { format } from 'util';

export function calculateRequestHeaderSize(harRequest) {
  let buffer = format(
    '%s %s %s\r\n',
    harRequest.method,
    harRequest.url,
    harRequest.httpVersion,
  );

  const headerLines = harRequest.headers.map((header) =>
    format('%s: %s\r\n', header.name, header.value),
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
    perflogResponse.statusText,
  );
  Object.keys(perflogResponse.headers).forEach((key) => {
    buffer = buffer.concat(
      format('%s: %s\r\n', key, perflogResponse.headers[key]),
    );
  });
  buffer = buffer.concat('\r\n');

  return buffer.length;
}
export function parseHeaders(headers) {
  if (!headers) {
    return [];
  }
  return Object.keys(headers).map((key) => {
    return {
      name: key,
      value: headers[key],
    };
  });
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
      .filter((key) => key.toLowerCase() === lowerCaseHeader)
      .map((key) => headers[key])
      .shift() || ''
  );
}
