# Chrome-har

[![Build status][travis-image]][travis-url]

Create [HAR](http://www.softwareishard.com/blog/har-12-spec/) files based on [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) data.

Code originally extracted from [Browsertime](https://github.com/sitespeedio/browsertime), initial implementation inspired by [Chromedriver_har](https://github.com/woodsaj/chromedriver_har).

[travis-image]: https://img.shields.io/travis/sitespeedio/chrome-har.svg?style=flat-square
[travis-url]: https://travis-ci.org/sitespeedio/chrome-har

## Support for Response Bodies

Chrome-har optionally supports response bodies in HARs if they are set on the [response object](https://chromedevtools.github.io/devtools-protocol/tot/Network#type-Response) by the caller and if the `includeTextFromResponseBody` otpion is set to `true`.

For example:
```
const harEvents: Array<any> = [];

const HAR_OBSERVE_EVENTS = [
  'Page.loadEventFired',
  'Page.domContentEventFired',
  'Page.frameStartedLoading',
  'Page.frameAttached',
  'Network.requestWillBeSent',
  'Network.requestServedFromCache',
  'Network.dataReceived',
  'Network.responseReceived',
  'Network.resourceChangedPriority',
  'Network.loadingFinished',
  'Network.loadingFailed',
];

HAR_OBSERVE_EVENTS.forEach((method: string) => {
  client.on(method, async (params: any) => {
    if (method === 'Network.requestIntercepted') {
      const response = await client.send(
        'Network.getResponseBodyForInterception',
        { interceptionId: params.interceptionId },
      );
      // Set the body on the response object
      params.response.body = response.body;
      params.request.continue();
    }
    harEvents.push({ method, params });
  });
});

const har = harFromMessages(harEvents, {includeTextFromResponseBody: true});
```
