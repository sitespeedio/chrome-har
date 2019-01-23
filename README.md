# Chrome-har

[![Build status][travis-image]][travis-url]

Create [HAR](http://www.softwareishard.com/blog/har-12-spec/) files based on [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) data.

Code originally extracted from [Browsertime](https://github.com/sitespeedio/browsertime), initial implementation inspired by [Chromedriver_har](https://github.com/woodsaj/chromedriver_har).

## Support for Response Bodies

Chrome-har optionally supports response bodies in HARs if they are set on the [response object](https://chromedevtools.github.io/devtools-protocol/tot/Network#type-Response) by the caller and if the `includeTextFromResponseBody` option is set to `true`.

For example, below we modify the code given in the blog post [Generate HAR with Puppeteer](https://michaljanaszek.com/blog/generate-har-with-puppeteer) by Michał Janaszek to add the response bodies to the HAR.

```javascript
const fs = require('fs');
const { promisify } = require('util');

const puppeteer = require('puppeteer');
const { harFromMessages } = require('chrome-har');

// list of events for converting to HAR
const events = [];

// list of promises that get the response body for a given response event
// (Network.responseReceived) and that add it to the event. These must all be
// resolved/rejected before we create the HAR from these events using
// chrome-har.
const addResponseBodyPromises: Array<Promise<void>> = [];

// event types to observe
const observe = [
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

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // register events listeners
  const client = await page.target().createCDPSession();
  await client.send('Page.enable');
  await client.send('Network.enable');
  observe.forEach(method => {
    client.on(method, params => {
      // push the event onto the array of events first, before potentially
      // blocking while fetching the response body, so the events remain in
      // order. This is required by chrome-har.
      const harEvent = { method, params };
      events.push(harEvent);

      if (method === 'Network.responseReceived') {
        const response = harEvent.params.response;
        const requestId = harEvent.params.requestId;
        // response body is unavailable for redirects, no-content, image, audio
        // and video responses
        if (response.status !== 204 &&
            response.headers.location == null &&
            !response.mimeType.includes('image') &&
            !response.mimeType.includes('audio') &&
            !response.mimeType.includes('video')
        ) {
          const addResponseBodyPromise = client.send(
            'Network.getResponseBody',
            { requestId },
          ).then((responseBody) => {
            // set the response so chrome-har can add it to the HAR
            harEvent.params.response = {
              ...response,
              body: new Buffer(
                responseBody.body,
                responseBody.base64Encoded ? 'base64' : undefined,
              ).toString(),
            };
          }, (reason) => {
            // resources (i.e. response bodies) are flushed after page commits
            // navigation and we are no longer able to retrieve them. In this
            // case, fail soft so we still add the rest of the response to the
            // HAR.
          });
          addResponseBodyPromises.push(addResponseBodyPromise);
        }
      }
    });
  });

  // perform tests
  await page.goto('https://en.wikipedia.org');
  page.click('#n-help > a');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await browser.close();

  // wait for the response body to be added to all of the
  // Network.responseReceived events before passing them to chrome-har to be
  // converted into a HAR.
	await Promise.all(addResponseBodyPromises);
  // convert events to HAR file
  const har = harFromMessages(events);
  await promisify(fs.writeFile)('en.wikipedia.org.har', JSON.stringify(har));
})();
```

[travis-image]: https://img.shields.io/travis/sitespeedio/chrome-har.svg?style=flat-square
[travis-url]: https://travis-ci.org/sitespeedio/chrome-har

