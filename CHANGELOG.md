# CHANGELOG

version 0.3.1 2018-03-29
-------------------------
* Also act on Page.frameScheduledNavigation (needed for Chrome 66 and coming Browsertime 3.0)

version 0.3.0 2018-03-15
-------------------------
* Add more information about request initiator to HAR. Thanks to David Dadon! [#9](https://github.com/sitespeedio/chrome-har/pull/9)

version 0.2.3 2017-10-15
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