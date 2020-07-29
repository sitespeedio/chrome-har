# CHANGELOG

version 0.11.10 2020-07-29
-------------------------
* Parse extra info events (parse extra request data from the Network.requestWillBeSentExtraInfo event and parse extra response data from the Network.responseReceivedExtraInfo event), thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR [#71](https://github.com/sitespeedio/chrome-har/pull/71).

* Update to day-js 1.8.31.

version 0.11.9 2020-05-26
-------------------------
* Updated dependencies: dayjs - 1.8.27, debug: 4.1.1, tough-cookie - 4.0.0, uuid - 8.0.0

version 0.11.8 (never released)
-------------------------
* Include iframe request when frame is not attached [#68](https://github.com/sitespeedio/chrome-har/pull/68) - thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR!

* Include response canceled by Chrome or user action [#67](https://github.com/sitespeedio/chrome-har/pull/67) - thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR!

version 0.11.7 2020-03-09
-------------------------
* And excluded the shrinkwrap file again.

version 0.11.6 2020-03-09
-------------------------
* Exclude the test folder from the release.

version 0.11.5 2020-03-09
-------------------------
* Added a shrinkwrap file.

version 0.11.4 2019-10-16
-------------------------
* Reverted the _initiator field fix since that was an old upstream issue in Chrome [#44](https://github.com/sitespeedio/chrome-har/pull/44).

version 0.11.3 2019-10-14
-------------------------
* Better parsing of the _initiator field fixing an error for some HARs, thank you  [Aleksandr Semyonov](https://github.com/juvirez) for the PR [#44](https://github.com/sitespeedio/chrome-har/pull/44).

version 0.11.2 2019-09-21
-------------------------
* Extra check that we really got a response in the trace [#54](https://github.com/sitespeedio/chrome-har/pull/54)

version 0.11.1 2019-09-14
-------------------------
* Catch if a request misses the response/timings [#53](https://github.com/sitespeedio/chrome-har/pull/53).

version 0.11.0 2019-07-23
-------------------------
* Include Chrome request id as _requestId to make it simpler in Browsertime to add response bodies  [#50](https://github.com/sitespeedio/chrome-har/pull/50).

version 0.10.0 2019-01-09
-------------------------
* Support for response bodies, thank you [Michael Cypher](https://github.com/mikeecb) for the PR [#41](https://github.com/sitespeedio/chrome-har/pull/41).

version 0.9.1 2019-01-03
-------------------------
* And also use the URL fragment so we can keep that [#40](https://github.com/sitespeedio/chrome-har/pull/40).

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
