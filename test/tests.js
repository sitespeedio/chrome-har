import test from 'ava';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { harFromMessages } from '../index.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERFLOGSPATH = path.resolve(__dirname, 'perflogs');

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateConnectionOverlap(t, entries) {
  const entriesByConnection = entries
    .filter(
      entry => !['h3', 'h2', 'spdy/3.1'].includes(entry.response.httpVersion)
    )
    .filter(entry => !(entry.cache || {}).beforeRequest)
    .reduce((entries, entry) => {
      const e = entries.get(entry.connection) || [];
      e.push(entry);
      entries.set(entry.connection, e);
      return entries;
    }, new Map());
  for (const [connection, entries] of entriesByConnection.entries()) {
    let previousEntry = entries.shift();
    for (let entry of entries) {
      const previousEnd =
        previousEntry._requestTime + previousEntry.time / 1000;
      const timings = entry.timings;
      t.true(
        entry._requestTime + Math.max(0, timings.blocked) / 1000 > previousEnd,
        `Two entries too close on connection ${connection}`
      );
      previousEntry = entry;
    }
  }
}

function perflog(filename) {
  return path.resolve(PERFLOGSPATH, filename);
}
function perflogs() {
  return fs
    .readdir(PERFLOGSPATH)
    .then(dirListing =>
      dirListing.filter(filename => path.extname(filename) === '.json')
    );
}

function parsePerflog(perflogPath, options) {
  return fs.readFile(perflogPath, { encoding: 'utf8' }).then(data => {
    const log = JSON.parse(data);
    const har = harFromMessages(log, options);
    return har;
  });
}

function sortedByRequestTime(entries) {
  return entries.sort((e1, e2) => e1._requestTime - e2._requestTime);
}

function resourceMessages({
  requestId,
  frameId,
  url,
  timestamp,
  wallTime,
  type = 'Document'
}) {
  return [
    {
      method: 'Network.requestWillBeSent',
      params: {
        requestId,
        frameId,
        loaderId: 'L1',
        documentURL: url,
        request: {
          url,
          method: 'GET',
          headers: {},
          initialPriority: type === 'Document' ? 'High' : 'Low'
        },
        timestamp,
        wallTime,
        initiator: { type: 'other' },
        type
      }
    },
    {
      method: 'Network.responseReceived',
      params: {
        requestId,
        frameId,
        loaderId: 'L1',
        timestamp: timestamp + 0.1,
        type,
        response: {
          url,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html' },
          mimeType: 'text/html',
          fromDiskCache: false,
          fromServiceWorker: false,
          encodedDataLength: 100,
          protocol: 'http/1.1',
          connectionId: 1,
          remoteIPAddress: '127.0.0.1',
          timing: {
            requestTime: timestamp,
            sendStart: 0,
            sendEnd: 1,
            receiveHeadersEnd: 2
          }
        }
      }
    },
    {
      method: 'Network.loadingFinished',
      params: { requestId, timestamp: timestamp + 0.2, encodedDataLength: 100 }
    }
  ];
}

function testAllHARs(t, options) {
  return perflogs().then(filenames => {
    const promises = filenames.map(filename => {
      return parsePerflog(perflog(filename), options)
        .then(har => {
          t.deepEqual(sortedByRequestTime(har.log.entries), har.log.entries);
          validateConnectionOverlap(t, har.log.entries);
        })
        .catch(error => {
          t.log(`Failed to generate valid HAR from ${filename}`);
          throw error;
        });
    });
    return Promise.all(promises);
  });
}

test('Generates valid HARs', t => {
  return testAllHARs(t);
});

test('Generates valid HARs including cached entries', t => {
  return testAllHARs(t, { includeResourcesFromDiskCache: true });
});

test('zdnet', t => {
  const perflogPath = perflog('www.zdnet.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      t.is(log.pages.length, 1);
      return log;
    })
    .then(log => {
      t.is(log.entries.length, 343);
      return log;
    });
});

test('ryan', t => {
  const perflogPath = perflog('ryan.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      t.is(log.pages.length, 1);
      return log;
    });
});

test('chrome66', t => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      t.is(log.entries.length, 9);
      return log;
    });
});

test('Parses IPv6 address', t => {
  const perflogPath = perflog('www.google.ru.json');
  return parsePerflog(perflogPath).then(har =>
    t.is(har.log.entries[0].serverIPAddress, '2a00:1450:400f:80a::2003')
  );
});

test('Lifts CDP renderBlockingBehavior onto entries as `_renderBlocking`', t => {
  // Minimal synthetic CDP stream: one render-blocking document + one
  // non-blocking subresource. The renderer in waterfall-tools matches
  // `_renderBlocking === 'blocking'` (lowercase) to draw the orange ⊗
  // marker, so we assert the casing here too.
  const frameId = 'F1';
  const baseMessages = (requestId, url, renderBlockingBehavior) => [
    {
      method: 'Network.requestWillBeSent',
      params: {
        requestId,
        frameId,
        loaderId: 'L1',
        documentURL: 'https://example.com/',
        request: {
          url,
          method: 'GET',
          headers: {},
          initialPriority: 'High'
        },
        timestamp: 1,
        wallTime: 1_700_000_000,
        initiator: { type: 'other' },
        type: requestId === '1' ? 'Document' : 'Script',
        ...(renderBlockingBehavior ? { renderBlockingBehavior } : {})
      }
    },
    {
      method: 'Network.responseReceived',
      params: {
        requestId,
        frameId,
        loaderId: 'L1',
        timestamp: 2,
        type: requestId === '1' ? 'Document' : 'Script',
        response: {
          url,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html' },
          mimeType: 'text/html',
          fromDiskCache: false,
          fromServiceWorker: false,
          encodedDataLength: 100,
          protocol: 'http/1.1',
          connectionId: 1,
          remoteIPAddress: '127.0.0.1',
          timing: {
            requestTime: 1,
            sendStart: 0,
            sendEnd: 1,
            receiveHeadersEnd: 2
          }
        }
      }
    },
    {
      method: 'Network.loadingFinished',
      params: { requestId, timestamp: 3, encodedDataLength: 100 }
    }
  ];
  const messages = [
    {
      method: 'Page.frameStartedLoading',
      params: { frameId }
    },
    ...baseMessages('1', 'https://example.com/', 'Blocking'),
    ...baseMessages('2', 'https://example.com/app.js', 'NonBlocking')
  ];
  const har = harFromMessages(messages);
  const byUrl = Object.fromEntries(
    har.log.entries.map(e => [e.request.url, e])
  );
  t.is(byUrl['https://example.com/']._renderBlocking, 'blocking');
  t.is(byUrl['https://example.com/app.js']._renderBlocking, 'nonblocking');
});

test('Omits `_renderBlocking` when CDP did not report it', t => {
  // Older Chrome builds don't emit renderBlockingBehavior at all — make sure
  // we don't materialise the field as `undefined` or an empty string in
  // that case. Absent input → absent output.
  const messages = [
    { method: 'Page.frameStartedLoading', params: { frameId: 'F1' } },
    {
      method: 'Network.requestWillBeSent',
      params: {
        requestId: '1',
        frameId: 'F1',
        loaderId: 'L1',
        documentURL: 'https://example.com/',
        request: {
          url: 'https://example.com/',
          method: 'GET',
          headers: {},
          initialPriority: 'High'
        },
        timestamp: 1,
        wallTime: 1_700_000_000,
        initiator: { type: 'other' },
        type: 'Document'
      }
    },
    {
      method: 'Network.responseReceived',
      params: {
        requestId: '1',
        frameId: 'F1',
        loaderId: 'L1',
        timestamp: 2,
        type: 'Document',
        response: {
          url: 'https://example.com/',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html' },
          mimeType: 'text/html',
          fromDiskCache: false,
          fromServiceWorker: false,
          encodedDataLength: 100,
          protocol: 'http/1.1',
          connectionId: 1,
          remoteIPAddress: '127.0.0.1',
          timing: {
            requestTime: 1,
            sendStart: 0,
            sendEnd: 1,
            receiveHeadersEnd: 2
          }
        }
      }
    },
    {
      method: 'Network.loadingFinished',
      params: { requestId: '1', timestamp: 3, encodedDataLength: 100 }
    }
  ];
  const har = harFromMessages(messages);
  t.false('_renderBlocking' in har.log.entries[0]);
});

test('Lifts `_renderBlocking` from a real Chrome perflog', t => {
  // Regression guard against the field-name typo this test file was first
  // shipped with (`renderBlockingStatus` vs. the real CDP field
  // `renderBlockingBehavior`). The synthetic tests above can't catch that
  // class of mistake — they'd silently pass against either spelling
  // because they author the input alongside the assertion. A real Chrome
  // perflog can.
  const perflogPath = perflog('soft-navigation-github-issues.json');
  return parsePerflog(perflogPath).then(har => {
    const values = new Set(
      har.log.entries.map(e => e._renderBlocking).filter(v => v !== undefined)
    );
    t.true(values.has('nonblocking'));
    t.true(values.has('nonblockingdynamic'));
  });
});

test('Forwards the resource type value', t => {
  const perflogPath = perflog('www.google.ru.json');
  const expected = {
    document: 1,
    image: 27,
    other: 4,
    script: 8,
    xhr: 1
  };
  return parsePerflog(perflogPath).then(har => {
    const collected = har.log.entries.map(x => x._resourceType);
    t.true(
      Object.entries(expected).every(
        ([key, value]) => collected.filter(x => x == key).length == value
      )
    );
  });
});

test('navigatedWithinDocument', t => {
  const perflogPath = perflog('navigatedWithinDocument.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      t.is(log.entries.length, 1);
      return log;
    });
});

test('Generates multiple pages', t => {
  const perflogPath = perflog('www.wikipedia.org.json');
  return parsePerflog(perflogPath).then(har => {
    t.is(har.log.pages.length, 2);
    return har;
  });
});

test('Skips empty pages', t => {
  const perflogPath = perflog('www.wikipedia.org-empty.json');
  return parsePerflog(perflogPath).then(har => {
    t.is(har.log.pages.length, 1);
    return har;
  });
});

test('Click on link in Chrome should create new page', t => {
  const perflogPath = perflog('linkClickChrome.json');
  return parsePerflog(perflogPath).then(har => {
    t.is(har.log.pages.length, 1);
    return har;
  });
});

test('Optionally creates pages for root frame navigations', t => {
  const frameId = 'F1';
  const messages = [
    { method: 'Page.frameStartedLoading', params: { frameId } },
    ...resourceMessages({
      requestId: '1',
      frameId,
      url: 'https://example.com/page1.html',
      timestamp: 1,
      wallTime: 1_700_000_000
    }),
    ...resourceMessages({
      requestId: '2',
      frameId,
      url: 'https://example.com/page1.js',
      timestamp: 1.3,
      wallTime: 1_700_000_000.3,
      type: 'Script'
    }),
    {
      method: 'Page.frameScheduledNavigation',
      params: { frameId, url: 'https://example.com/page2.html' }
    },
    ...resourceMessages({
      requestId: '3',
      frameId,
      url: 'https://example.com/page2.html',
      timestamp: 2,
      wallTime: 1_700_000_001
    }),
    { method: 'Page.frameStartedLoading', params: { frameId } },
    ...resourceMessages({
      requestId: '4',
      frameId,
      url: 'https://example.com/page2.js',
      timestamp: 2.3,
      wallTime: 1_700_000_001.3,
      type: 'Script'
    })
  ];

  const defaultHar = harFromMessages(messages);
  t.is(defaultHar.log.pages.length, 1);

  const multiPageHar = harFromMessages(messages, { allowMultiPage: true });
  t.deepEqual(
    multiPageHar.log.pages.map(page => page.title),
    ['https://example.com/page1.html', 'https://example.com/page2.html']
  );

  const pagerefByUrl = Object.fromEntries(
    multiPageHar.log.entries.map(entry => [entry.request.url, entry.pageref])
  );
  t.is(pagerefByUrl['https://example.com/page1.html'], 'page_1');
  t.is(pagerefByUrl['https://example.com/page1.js'], 'page_1');
  t.is(pagerefByUrl['https://example.com/page2.html'], 'page_2');
  t.is(pagerefByUrl['https://example.com/page2.js'], 'page_2');
});

test('Includes pushed assets', t => {
  const perflogPath = perflog('akamai-h2push.json');
  return parsePerflog(perflogPath)
    .then(har => {
      t.is(har.log.pages.length, 1);
      return har;
    })
    .then(har => {
      const images = har.log.entries.filter(e =>
        e.request.url.startsWith('https://http2.akamai.com/demo/tile-')
      );
      t.is(images.length, 361); // 19*19 = 361 image tiles

      const pushedImages = images.filter(i => i._was_pushed === 1);
      t.is(pushedImages.length, 3);

      return har;
    });
});

test('Includes early hints requests', t => {
  const perflogPath = perflog('early-hints.json');
  return parsePerflog(perflogPath).then(har => {
    const earlyHints = har.log.entries.filter(e => e.response.fromEarlyHints);
    t.is(earlyHints.length, 11);

    return har;
  });
});

test('Includes response bodies', t => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  return parsePerflog(perflogPath, { includeTextFromResponseBody: true })
    .then(har => har.log)
    .then(log => {
      t.is(
        log.entries.filter(e => e.response.content.text != undefined).length,
        1
      );
      return log;
    });
});

test('Includes canceled response', t => {
  const perflogPath = perflog('canceled-video.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const videoAsset = log.entries.find(
        e => e.request.url === 'https://www.w3schools.com/tags/movie.mp4'
      );
      t.is(videoAsset.timings.receive, 316.563);
      t.is(videoAsset.time, 343.330_999_999_999_96);

      return log;
    });
});

test('Includes iframe request when frame is not attached', t => {
  const perflogPath = perflog('iframe-not-attached.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const imageAsset = log.entries.filter(
        e => e.request.url === 'https://www.w3schools.com/html/img_girl.jpg'
      );
      t.is(imageAsset.length, 1);

      return log;
    });
});

test('Includes extra info in request', t => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const cssAsset = log.entries.find(e =>
        e.request.url.endsWith(
          'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css'
        )
      );
      t.is(cssAsset.request.headers.length, 15);

      return log;
    });
});

test('Includes extra info in response', t => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const cssAsset = log.entries.find(e =>
        e.request.url.endsWith(
          'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css'
        )
      );
      t.is(cssAsset.response.headers.length, 14);

      return log;
    });
});

test('Excludes request blocked cookies', t => {
  const perflogPath = perflog('samesite-sandbox.glitch.me.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const cookiesAsset = log.entries.find(e =>
        e.request.url.endsWith('cookies.json')
      );
      t.is(cookiesAsset.request.cookies.length, 4);

      return log;
    });
});

test('Excludes response blocked cookies', t => {
  const perflogPath = perflog('response-blocked-cookies.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const request = log.entries.find(
        e => e.request.url === 'https://ow5u1.sse.codesandbox.io/'
      );
      t.is(request.response.cookies.length, 1);

      return log;
    });
});

test('Includes initial redirect', t => {
  const perflogPath = perflog('www.vercel.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      t.is(log.pages.length, 1);
      return log;
    })
    .then(log => {
      t.is(log.entries.length, 99);
      return log;
    })
    .then(log => {
      t.is(log.entries[0].response.status, 308);
      return log;
    });
});

test('Includes charset in response content', t => {
  const perflogPath = perflog('bing.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      const entry = log.entries.find(
        e => e.response.content.charset !== undefined
      );
      t.truthy(entry, 'Should have at least one entry with charset');
      t.is(typeof entry.response.content.charset, 'string');
      return log;
    });
});

test('Network.responseReceivedExtraInfo may be fired before or after responseReceived', t => {
  const perflogPath = perflog('bing.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => log.entries)
    .then(entries => {
      const checkingEntries = entries.filter(x => x._requestId == '98243.71');
      t.is(checkingEntries.length, 1);
      const entry = checkingEntries[0];
      // set-cookie header only exists in Network.responseReceivedExtraInfo event
      t.is(
        entry.response.headers.filter(x => x.name == 'set-cookie').length,
        1
      );
    });
});

test('Soft navigation updates the current page', t => {
  const perflogPath = perflog('soft-navigation-github.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .then(log => {
      // Soft navigation should update the page, not create a new one
      t.is(log.pages.length, 1);
      t.is(log.pages[0]._softNavigation, true);
      t.is(
        log.pages[0].title,
        'https://github.com/sitespeedio/browsertime/pulls'
      );
      // All entries should belong to the single page
      const allOnPage = log.entries.every(e => e.pageref === 'page_1');
      t.true(allOnPage);
    });
});

test('Multiple GitHub soft navigations each update their page', async t => {
  const perflogs = [
    [
      'soft-navigation-github-pulls.json',
      'https://github.com/sitespeedio/browsertime/pulls'
    ],
    [
      'soft-navigation-github-code.json',
      'https://github.com/sitespeedio/browsertime'
    ],
    [
      'soft-navigation-github-issues.json',
      'https://github.com/sitespeedio/browsertime/issues'
    ]
  ];

  for (const [file, expectedUrl] of perflogs) {
    const messages = JSON.parse(await fs.readFile(perflog(file), 'utf8'));
    const har = harFromMessages(messages);
    t.is(har.log.pages.length, 1);
    t.is(har.log.pages[0]._softNavigation, true);
    t.is(har.log.pages[0].title, expectedUrl);
    t.true(har.log.entries.length > 0);
  }
});

test('Multiple React soft navigations each update their page', async t => {
  const perflogs = [
    [
      'soft-navigation-react-describing-ui.json',
      'https://react.dev/learn/describing-the-ui'
    ],
    [
      'soft-navigation-react-first-component.json',
      'https://react.dev/learn/your-first-component'
    ],
    [
      'soft-navigation-react-importing-exporting.json',
      'https://react.dev/learn/importing-and-exporting-components'
    ],
    ['soft-navigation-react-back-to-learn.json', 'https://react.dev/learn']
  ];

  for (const [file, expectedUrl] of perflogs) {
    const messages = JSON.parse(await fs.readFile(perflog(file), 'utf8'));
    const har = harFromMessages(messages);
    t.is(har.log.pages.length, 1);
    t.is(har.log.pages[0]._softNavigation, true);
    t.is(har.log.pages[0].title, expectedUrl);
    t.true(har.log.entries.length > 0);
  }
});
