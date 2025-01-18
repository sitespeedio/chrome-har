#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harFromMessages } from '../index.js';

if (process.argv.length !== 3) {
  console.error('Specify a path to a messages file');
  process.exit(1);
}

const perflogPath = process.argv[2];

try {
  const perflogContent = await readFile(path.resolve(perflogPath), 'utf8');
  const messages = JSON.parse(perflogContent);
  const har = await harFromMessages(messages);
  const harJson = JSON.stringify(har, undefined, 2);
  const harFilePath = path.basename(perflogPath, '.json') + '.har';

  await writeFile(harFilePath, harJson, 'utf8');
} catch (error) {
  console.error('An error occurred:', error.message);
  process.exit(1);
}
