import { parse } from 'node:url';
import debug from 'debug';
const log = debug('chrome-har');

const isEmpty = o => !o;

export function isHttp1x(version) {
  return version.toLowerCase().startsWith('http/1.');
}
export function formatMillis(time, fractionalDigits = 3) {
  return Number(Number(time).toFixed(fractionalDigits));
}
export function toNameValuePairs(object) {
  return Object.keys(object).reduce((result, name) => {
    const value = object[name];
    return Array.isArray(value)
      ? result.concat(
          value.map(v => {
            return { name, value: v };
          })
        )
      : result.concat([{ name, value }]);
  }, []);
}
export function parseUrlEncoded(data) {
  const params = parse(`?${data}`, true).query;
  return this.toNameValuePairs(params);
}
export function parsePostData(contentType, postData) {
  if (isEmpty(contentType) || isEmpty(postData)) {
    return;
  }

  try {
    if (/^application\/x-www-form-urlencoded/.test(contentType)) {
      return {
        mimeType: contentType,
        params: this.parseUrlEncoded(postData)
      };
    }
    if (/^application\/json/.test(contentType)) {
      return {
        mimeType: contentType,
        params: this.toNameValuePairs(JSON.parse(postData))
      };
    }
    // FIXME parse multipart/form-data as well.
  } catch {
    log(`Unable to parse post data '${postData}' of type ${contentType}`);
    // Fall back to include postData as text.
  }
  return {
    mimeType: contentType,
    text: postData
  };
}
export function isSupportedProtocol(url) {
  return /^https?:/.test(url);
}
