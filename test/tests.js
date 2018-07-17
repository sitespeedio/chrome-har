import test from 'ava';
import * as validator from 'har-validator';
import * as Promise from 'bluebird';
import * as fs from 'fs';
import * as path from 'path';
import parser from '../';

Promise.promisifyAll(fs);

const PERFLOGSPATH = path.resolve(__dirname, 'perflogs');

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateConnectionOverlap(t, entries) {
  const entriesByConnection = entries
    .filter(entry => !['h2', 'spdy/3.1'].includes(entry.response.httpVersion))
    .filter(entry => !(entry.cache || {}).beforeRequest)
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
        `Two entries too close on connection ${connection}`
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
    .readdirAsync(PERFLOGSPATH)
    .filter(filename => path.extname(filename) === '.json');
}

function parsePerflog(perflogPath, options) {
  return fs
    .readFileAsync(perflogPath)
    .then(JSON.parse)
    .then(messages => parser.harFromMessages(messages, options))
    .tap(har => validator.har(har));
}

function sortedByRequestTime(entries) {
  return entries.sort((e1, e2) => e1._requestTime - e2._requestTime);
}

function testAllHARs(t, options) {
  return perflogs().each(filename => {
    return parsePerflog(perflog(filename), options)
      .tap(har =>
        t.deepEqual(sortedByRequestTime(har.log.entries), har.log.entries)
      )
      .tap(har => validateConnectionOverlap(t, har.log.entries))
      .catch(e => {
        t.log(`Failed to generate valid HAR from ${filename}`);
        throw e;
      });
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
    .tap(log => t.is(log.pages.length, 1))
    .tap(log => t.is(log.entries.length, 343));
});

test('chrome66', t => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .tap(log => t.is(log.entries.length, 9));
});

test('Parses IPv6 address', t => {
  const perflogPath = perflog('www.google.ru.json');
  return parsePerflog(perflogPath).then(har =>
    t.is(har.log.entries[0].serverIPAddress, '2a00:1450:400f:80a::2003')
  );
});

test('Generates multiple pages', t => {
  const perflogPath = perflog('www.wikipedia.org.json');
  return parsePerflog(perflogPath).tap(har => t.is(har.log.pages.length, 2));
});

test('Skips empty pages', t => {
  const perflogPath = perflog('www.wikipedia.org-empty.json');
  return parsePerflog(perflogPath).tap(har => t.is(har.log.pages.length, 1));
});

test('Includes pushed assets', t => {
  const perflogPath = perflog('akamai-h2push.json');
  return parsePerflog(perflogPath)
    .tap(har => t.is(har.log.pages.length, 1))
    .tap(har => {
      const images = har.log.entries.filter(e =>
        e.request.url.startsWith('https://http2.akamai.com/demo/tile-')
      );
      t.is(images.length, 361); // 19*19 = 361 image tiles

      const pushedImages = images.filter(i => i._was_pushed === 1);
      t.is(pushedImages.length, 3);
    });
});

test('Includes _request_id', t => {
  const countIds = entries =>
    entries.reduce((count, entry) => {
      return entry.hasOwnProperty('_request_id') ? ++count : count;
    }, 0);
  const perflogPath = perflog('www.wikipedia.org.json');
  return parsePerflog(perflogPath).tap(har =>
    t.is(countIds(har.log.entries), har.log.entries.length)
  );
});
