# CHANGELOG

UNRELEASED
-------------------------
* Prevent creating HAR files with empty pages (i.e. pages with no entries).

version 0.2.2 2017-06-30
-------------------------
* Be extra careful when parsing JSON see [#4](https://github.com/sitespeedio/chrome-har/issues/4)

version 0.2.1 2017-05-31
-------------------------
* Remove unused files from npm distribution.

version 0.2.0 2017-05-31
-------------------------
* Add "serverIPAddress" field to entries.
* Set bodySize for requests correctly.
* Set bodySize and compression for responses correctly.
* Add _transferSize field for responses, just like Chrome does.

version 0.1.0 2017-03-05
-------------------------
* Initial release