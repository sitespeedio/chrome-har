import test from 'ava';
import * as validator from 'har-validator';
import * as fs from 'fs/promises';
import * as path from 'path';
import { harFromMessages } from '../index.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERFLOGSPATH = path.resolve(__dirname, 'perflogs');

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateConnectionOverlap(t, entries) {
  const entriesByConnection = entries
    .filter(
      (entry) => !['h3', 'h2', 'spdy/3.1'].includes(entry.response.httpVersion),
    )
    .filter((entry) => !(entry.cache || {}).beforeRequest)
    .reduce((entries, entry) => {
      const e = entries.get(entry.connection) || [];
      e.push(entry);
      entries.set(entry.connection, e);
      return entries;
    }, new Map());
  entriesByConnection.forEach((entries, connection) => {
    let previousEntry = entries.shift();
    for (let entry of entries) {
      const previousEnd =
        previousEntry._requestTime + previousEntry.time / 1000;
      const timings = entry.timings;
      t.true(
        entry._requestTime + Math.max(0, timings.blocked) / 1000 > previousEnd,
        `Two entries too close on connection ${connection}`,
      );
      previousEntry = entry;
    }
  });
}

function perflog(filename) {
  return path.resolve(PERFLOGSPATH, filename);
}
function perflogs() {
  return fs
    .readdir(PERFLOGSPATH)
    .then((dirListing) =>
      dirListing.filter((filename) => path.extname(filename) === '.json'),
    );
}

async function* asyncMessageGenerator(messages) {
  for (const message of messages) {
    await Promise.resolve();
    yield message;
  }
}

function parsePerflog(perflogPath, options) {
  return fs.readFile(perflogPath, { encoding: 'utf8' }).then(async (data) => {
    const log = JSON.parse(data);
    const har = await harFromMessages(log, options);
    validator.har(har);
    return har;
  });
}

function asyncParsePerflog(perflogPath, options) {
  return fs.readFile(perflogPath, { encoding: 'utf8' }).then(async (data) => {
    const log = JSON.parse(data);
    const asyncIterator = asyncMessageGenerator(log);
    const har = await harFromMessages(asyncIterator, options);
    validator.har(har);
    return har;
  });
}

function sortedByRequestTime(entries) {
  return entries.sort((e1, e2) => e1._requestTime - e2._requestTime);
}

function testAllHARs(t, options) {
  return perflogs().then((filenames) => {
    const promises = filenames.map((filename) => {
      return parsePerflog(perflog(filename), options)
        .then((har) => {
          t.deepEqual(sortedByRequestTime(har.log.entries), har.log.entries);
          validateConnectionOverlap(t, har.log.entries);
        })
        .catch((e) => {
          t.log(`Failed to generate valid HAR from ${filename}`);
          throw e;
        });
    });
    return Promise.all(promises);
  });
}

test('Generates valid HARs', (t) => {
  return testAllHARs(t);
});

test('Generates valid HARs including cached entries', (t) => {
  return testAllHARs(t, { includeResourcesFromDiskCache: true });
});

test('zdnet', (t) => {
  const perflogPath = perflog('www.zdnet.com.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.pages.length, 1);
      return log;
    })
    .then((log) => {
      t.is(log.entries.length, 343);
      return log;
    });
});

test('ryan', (t) => {
  const perflogPath = perflog('ryan.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.pages.length, 1);
      return log;
    });
});

test('ryan asyncIterator', (t) => {
  const perflogPath = perflog('ryan.json');
  return asyncParsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.pages.length, 1);
      return log;
    });
});

test('chrome66', (t) => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.entries.length, 9);
      return log;
    });
});

test('Parses IPv6 address', (t) => {
  const perflogPath = perflog('www.google.ru.json');
  return parsePerflog(perflogPath).then((har) =>
    t.is(har.log.entries[0].serverIPAddress, '2a00:1450:400f:80a::2003'),
  );
});

test('Forwards the resource type value', (t) => {
  const perflogPath = perflog('www.google.ru.json');
  const expected = {
    document: 1,
    image: 27,
    other: 4,
    script: 8,
    xhr: 1,
  };
  return parsePerflog(perflogPath).then((har) => {
    const collected = har.log.entries.map((x) => x._resourceType);
    t.true(
      Object.entries(expected).every(
        ([key, value]) => collected.filter((x) => x == key).length == value,
      ),
    );
  });
});

test('navigatedWithinDocument', (t) => {
  const perflogPath = perflog('navigatedWithinDocument.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.entries.length, 1);
      return log;
    });
});

test('Generates multiple pages', (t) => {
  const perflogPath = perflog('www.wikipedia.org.json');
  return parsePerflog(perflogPath).then((har) => {
    t.is(har.log.pages.length, 2);
    return har;
  });
});

test('Skips empty pages', (t) => {
  const perflogPath = perflog('www.wikipedia.org-empty.json');
  return parsePerflog(perflogPath).then((har) => {
    t.is(har.log.pages.length, 1);
    return har;
  });
});

test('Click on link in Chrome should create new page', (t) => {
  const perflogPath = perflog('linkClickChrome.json');
  return parsePerflog(perflogPath).then((har) => {
    t.is(har.log.pages.length, 1);
    return har;
  });
});

test('Includes pushed assets', (t) => {
  const perflogPath = perflog('akamai-h2push.json');
  return parsePerflog(perflogPath)
    .then((har) => {
      t.is(har.log.pages.length, 1);
      return har;
    })
    .then((har) => {
      const images = har.log.entries.filter((e) =>
        e.request.url.startsWith('https://http2.akamai.com/demo/tile-'),
      );
      t.is(images.length, 361); // 19*19 = 361 image tiles

      const pushedImages = images.filter((i) => i._was_pushed === 1);
      t.is(pushedImages.length, 3);

      return har;
    });
});

test('Includes early hints requests', (t) => {
  const perflogPath = perflog('early-hints.json');
  return parsePerflog(perflogPath).then((har) => {
    const earlyHints = har.log.entries.filter((e) => e.response.fromEarlyHints);
    t.is(earlyHints.length, 11);

    return har;
  });
});

test('Includes response bodies', (t) => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  return parsePerflog(perflogPath, { includeTextFromResponseBody: true })
    .then((har) => har.log)
    .then((log) => {
      t.is(
        log.entries.filter((e) => e.response.content.text != null).length,
        1,
      );
      return log;
    });
});

test('Includes canceled response', (t) => {
  const perflogPath = perflog('canceled-video.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const videoAsset = log.entries.find(
        (e) => e.request.url === 'https://www.w3schools.com/tags/movie.mp4',
      );
      t.is(videoAsset.timings.receive, 316.563);
      t.is(videoAsset.time, 343.33099999999996);

      return log;
    });
});

test('Includes iframe request when frame is not attached', (t) => {
  const perflogPath = perflog('iframe-not-attached.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const imageAsset = log.entries.filter(
        (e) => e.request.url === 'https://www.w3schools.com/html/img_girl.jpg',
      );
      t.is(imageAsset.length, 1);

      return log;
    });
});

test('Includes extra info in request', (t) => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const cssAsset = log.entries.find((e) =>
        e.request.url.endsWith(
          'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css',
        ),
      );
      t.is(cssAsset.request.headers.length, 15);

      return log;
    });
});

test('Includes extra info in response', (t) => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const cssAsset = log.entries.find((e) =>
        e.request.url.endsWith(
          'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css',
        ),
      );
      t.is(cssAsset.response.headers.length, 14);

      return log;
    });
});

test('Excludes request blocked cookies', (t) => {
  const perflogPath = perflog('samesite-sandbox.glitch.me.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const cookiesAsset = log.entries.find((e) =>
        e.request.url.endsWith('cookies.json'),
      );
      t.is(cookiesAsset.request.cookies.length, 4);

      return log;
    });
});

test('Excludes response blocked cookies', (t) => {
  const perflogPath = perflog('response-blocked-cookies.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      const request = log.entries.find(
        (e) => e.request.url === 'https://ow5u1.sse.codesandbox.io/',
      );
      t.is(request.response.cookies.length, 1);

      return log;
    });
});

test('Includes initial redirect', (t) => {
  const perflogPath = perflog('www.vercel.com.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => {
      t.is(log.pages.length, 1);
      return log;
    })
    .then((log) => {
      t.is(log.entries.length, 99);
      return log;
    })
    .then((log) => {
      t.is(log.entries[0].response.status, 308);
      return log;
    });
});

test('Network.responseReceivedExtraInfo may be fired before or after responseReceived', (t) => {
  const perflogPath = perflog('bing.com.json');
  return parsePerflog(perflogPath)
    .then((har) => har.log)
    .then((log) => log.entries)
    .then((entries) => {
      const checkingEntries = entries.filter((x) => x._requestId == '98243.71');
      t.is(checkingEntries.length, 1);
      const entry = checkingEntries[0];
      // set-cookie header only exists in Network.responseReceivedExtraInfo event
      t.is(
        entry.response.headers.filter((x) => x.name == 'set-cookie').length,
        1,
      );
    });
});
