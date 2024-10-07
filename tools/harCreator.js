#!/usr/bin/env node

'use strict';

import { readFile, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { harFromMessages } from '../index.js';

if (process.argv.length !== 3) {
  console.error('Specify a path to a messages file');
  process.exit(1);
}

const perflogPath = process.argv[2];

readFile(resolve(perflogPath), 'utf8')
  .then(JSON.parse)
  .then((messages) => harFromMessages(messages))
  .then((har) => JSON.stringify(har, null, 2))
  .then((har) =>
    writeFile(basename(perflogPath, '.json') + '.har', har, 'utf8'),
  );
