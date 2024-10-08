# Chrome-har

![Unit tests](https://github.com/sitespeedio/chrome-har/workflows/Unit%20tests/badge.svg)

Create [HAR](http://www.softwareishard.com/blog/har-12-spec/) files based on [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) data.

We got tired of waiting for the +30K engineers at Google implementing a way to automate to get a HAR file [https://issues.chromium.org/issues/40809195](https://issues.chromium.org/issues/40809195) so we implemented our own solution in the mean time.


Code originally extracted from [Browsertime](https://github.com/sitespeedio/browsertime), initial implementation inspired by [Chromedriver_har](https://github.com/woodsaj/chromedriver_har).

## Create a new bug report
Make sure to generate a event trace log file that we can use to recreate your issue. If you use Browsertime you can enable the trace with `--chrome.collectPerfLog`:

```
$ browsertime --chrome.collectPerfLog -n 1 https://www.sitespeed.io
```

Then take the file named **chromePerflog-1.json.gz** and put it in a gist or make it availible to us in any way you want.


If you use sitespeed.io:
```
$ sitespeed.io --browsertime.chrome.collectPerfLog -n 1 https://www.sitespeed.io
```

## Support for Response Bodies

If you use Chrome-har standalone (without Browsertime/sitespeed.io) you can use get the response bodies in HARs if they are set on the [response object](https://chromedevtools.github.io/devtools-protocol/tot/Network#type-Response) by the caller and if the `includeTextFromResponseBody` option is set to `true`.

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
