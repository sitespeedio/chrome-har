'use strict';

let parser = require('..'),
  assert = require('assert'),
  fs = require('fs'),
  path = require('path');

describe('chrome-perflog-parser', function() {
  describe('#harFromMessages', function() {
    it('should make har for http 1 page', function() {
      let datadir = path.resolve(__dirname, 'testdata');
      let messagesFile = path.resolve(datadir, 'h1.json');

      let messages = JSON.parse(fs.readFileSync(messagesFile, 'utf-8'));

      let har = parser.harFromMessages(messages);
      assert.equal(har.log.pages.length, 1);
      assert.equal(har.log.entries.length, 48);
    });

    it('should make har for http 2 page', function() {
      let datadir = path.resolve(__dirname, 'testdata');
      let messagesFile = path.resolve(datadir, 'h2.json');

      let messages = JSON.parse(fs.readFileSync(messagesFile, 'utf-8'));

      let har = parser.harFromMessages(messages);
      assert.equal(har.log.pages.length, 1);
      assert.equal(har.log.entries.length, 2);
    });
  })
});
