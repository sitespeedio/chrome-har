# CHANGELOG

version 0.9.0 2019-01-03
-------------------------
* Keep hash (#) in URLs. We used to remove them to follow the same path as Chrome but Firefox do not and it breaks later in our tool chain to change the URL [#39](https://github.com/sitespeedio/chrome-har/pull/39).

version 0.8.1 2019-01-03
-------------------------
* Tech: Simplify logic for skipping pages.

version 0.8.0 2019-01-01
-------------------------
* Skip support for multi page navigation by script (this makes things much easier in Browsertime) [#38](https://github.com/sitespeedio/chrome-har/pull/38).

version 0.7.1 2018-12-13
-------------------------
* Pickup requests/responses that happens before navigation and block some sctript navigations [#36](https://github.com/sitespeedio/chrome-har/pull/36).

version 0.7.0 2018-11-23
-------------------------
* Catch requestWillBeSent that happens before navigation [#34](https://github.com/sitespeedio/chrome-har/pull/34). This fixes when you click on a link in Chrome that generates a new navigation.

version 0.6.0 2018-11-23
-------------------------
* Use dayjs instead of moment [#33](https://github.com/sitespeedio/chrome-har/pull/33).
* Support for having a HAR with multiple pages from Browsertime [#30](https://github.com/sitespeedio/chrome-har/pull/30).
* Internal: Split the code to different files to make it easier to read the code [#32](https://github.com/sitespeedio/chrome-har/pull/32).


version 0.5.0 2018-10-12
-------------------------
* Catch Chrome navigating within page [#28](https://github.com/sitespeedio/chrome-har/pull/28).

version 0.4.1 2018-06-01
-------------------------
* Added extra guard for checking if a response is pushed to fix [sitespeed.io #2068](https://github.com/sitespeedio/sitespeed.io/issues/2068).

version 0.4.0 2018-05-29
-------------------------
* Including cached entries in the HAR now generates a HAR that validates against the HAR schema.
* Include responses that were pushed with HTTP2. Thanks to Martino Trevisan! [#21](https://github.com/sitespeedio/chrome-har/pull/21)

version 0.3.2 2018-04-07
-------------------------
* Fixes for situations that could result in incorrect HARs (missing startedDateTime or missing first entry).
* Format IPv6 addresses so HARs validate with [har-validator](https://github.com/ahmadnassri/har-validator)

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