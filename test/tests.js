import test from "ava";
import * as validator from "har-validator";
import * as Promise from "bluebird";
import * as fs from "fs";
import * as path from "path";
import parser from "../";

Promise.promisifyAll(fs);

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateConnectionOverlap(t, entries) {
  const entriesByConnection = entries
    .filter((entry) => entry.response.httpVersion !== 'h2')
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

function testdata(filename) {
  return path.resolve(__dirname, 'testdata', filename);
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

test('h1', t => {
  const perflogPath = testdata('h1.json');
  return parsePerflog(perflogPath)
    .then(() => t.pass('Valid HAR'));
});

test('h2', t => {
  const perflogPath = testdata('h2.json');
  return parsePerflog(perflogPath)
    .then(() => t.pass('Valid HAR'));
});

test('zdnet', t => {
  const perflogPath = testdata('www.zdnet.com.json');
  return parsePerflog(perflogPath)
    .then(har => har.log)
    .tap(log => t.is(log.pages.length, 1))
    .tap(log => t.is(log.entries.length, 343))
    .tap(log => t.deepEqual(sortedByRequestTime(log.entries), log.entries))
    .tap(log => validateConnectionOverlap(t, log.entries));
});
