# Chrome-har

[![Build status][travis-image]][travis-url]

Create [HAR](http://www.softwareishard.com/blog/har-12-spec/) files based on [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) data.

Code originally extracted from [Browsertime](https://github.com/sitespeedio/browsertime), initial implementation inspired by [Chromedriver_har](https://github.com/woodsaj/chromedriver_har).

## Support for Response Bodies

Chrome-har optionally supports response bodies in HARs if they are set on the [response object](https://chromedevtools.github.io/devtools-protocol/tot/Network#type-Response) by the caller and if the `includeTextFromResponseBody` option is set to `true`.

For example:

```javascript
const harEvents: Array<any> = [];

client.on('Network.requestIntercepted', async (params: any) => {
  // Get the response body
  const response = await client.send(
    'Network.getResponseBodyForInterception',
    { interceptionId: params.interceptionId },
  );

  // Set the body on the response object
  if (params.response != null) {
    params.response.body = response.body;
  } else {
    params.response = response;
  }

  // Continue the request
  await client.send(
    'Network.continueInterceptedRequest',
    { interceptionId: params.interceptionId },
  );

  harEvents.push({ method, params });
});

const har = harFromMessages(harEvents, {includeTextFromResponseBody: true});
```

[travis-image]: https://img.shields.io/travis/sitespeedio/chrome-har.svg?style=flat-square
[travis-url]: https://travis-ci.org/sitespeedio/chrome-har

