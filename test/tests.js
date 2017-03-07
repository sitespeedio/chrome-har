import test from "ava";
import * as validator from "har-validator";
import * as Promise from "bluebird";
import * as fs from "fs";
import * as path from "path";
import parser from "../";

Promise.promisifyAll(fs);

const PERFLOGSPATH = path.resolve(__dirname, 'perflogs');

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateConnectionOverlap(t, entries) {
  const entriesByConnection = entries
    .filter((entry) => !['h2', 'spdy/3.1'].includes(entry.response.httpVersion))
    .reduce((entries, entry) => {
      const e = entries.get(entry.connection) || [];
      e.push(entry);
      entries.set(entry.connection, e);
      return entries;
    }, new Map());

  entriesByConnection.forEach((entries, connection) => {
    let previousEntry = entries.shift();
    for (let entry of entries) {
      const previousEnd = previousEntry._requestTime + (previousEntry.time / 1000);
      const timings = entry.timings;
      t.true((entry._requestTime + Math.max(0, timings.blocked) / 1000 > previousEnd),
        `Two entries too close on connection ${connection}`);
      previousEntry = entry;
    }
  });
}

function perflog(filename) {
  return path.resolve(PERFLOGSPATH, filename);
}

function perflogs() {
  return fs.readdirAsync(PERFLOGSPATH)
    .filter((filename) => path.extname(filename) === '.json');
}

function parsePerflog(perflogPath) {
  return fs.readFileAsync(perflogPath)
    .then(JSON.parse)
    .then((messages) => parser.harFromMessages(messages))
    .tap((har) => validator.har(har));
}

function sortedByRequestTime(entries) {
  return entries.sort((e1, e2) => e1._requestTime - e2._requestTime)
}

test('Generates valid HARs', t => {
  return perflogs().each((filename) => {
      return parsePerflog(perflog(filename))
        .tap(har => t.deepEqual(sortedByRequestTime(har.log.entries), har.log.entries))
        .tap(har => validateConnectionOverlap(t, har.log.entries))
        .then(() => t.pass('Valid HAR'));
    });
});

test('zdnet', t => {
  const perflogPath = perflog('www.zdnet.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .tap(log => t.is(log.pages.length, 1))
    .tap(log => t.is(log.entries.length, 343));
});

test('Generates multiple pages', t => {
  const perflogPath = perflog('www.wikipedia.org.json');
  return parsePerflog(perflogPath)
    .tap(har => t.is(har.log.pages.length, 2));
});
