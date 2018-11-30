#!/usr/bin/env node

'use strict';

const fs = require('fs'),
  path = require('path'),
  Promise = require('bluebird'),
  argv = require('minimist')(process.argv.slice(2)),
  parser = require('..');

Promise.promisifyAll(fs);

if (!argv._.length) {
  console.error('Specify a path to a messages file');
  process.exit(1);
}

const perflogPath = argv._[0];

fs
  .readFileAsync(path.resolve(perflogPath), 'utf8')
  .then(JSON.parse)
  .then(messages => parser.harFromMessages(messages, {lighthouse: argv.lighthouse}))
  .then(har => JSON.stringify(har, null, 2))
  .then(har =>
    fs.writeFileAsync(path.basename(perflogPath, '.json') + '.har', har, 'utf8')
  ).catch(e => console.error(e.message));
