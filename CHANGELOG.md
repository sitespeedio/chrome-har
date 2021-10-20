# CHANGELOG

## 0.12.0 UNRELEASED
## Added
* Addend encoding field to tyhe response, thank you [Miroslav Balaz](https://github.com/miro-balaz) for the PR [#79](https://github.com/sitespeedio/chrome-har/pull/79).

## 0.11.12 2020-09-09
### Fixed
* Removed test directory from the release, thank you [Yury Michurin](https://github.com/yurynix) for the PR [#75](https://github.com/sitespeedio/chrome-har/pull/75).

## 0.11.11 2020-08-06
### Fixed
* Fix: Optional cookie object, see PR [73](https://github.com/sitespeedio/chrome-har/pull/73). Thank you [Michael Dijkstra](https://github.com/mikedijkstra).

## 0.11.10 2020-07-29

### Added
* Parse extra info events (parse extra request data from the Network.requestWillBeSentExtraInfo event and parse extra response data from the Network.responseReceivedExtraInfo event), thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR [#71](https://github.com/sitespeedio/chrome-har/pull/71).

* Update to day-js 1.8.31.

##  0.11.9 2020-05-26

### Fixed
* Updated dependencies: dayjs - 1.8.27, debug: 4.1.1, tough-cookie - 4.0.0, uuid - 8.0.0

## 0.11.8 (never released)
-------------------------
### Added
* Include iframe request when frame is not attached [#68](https://github.com/sitespeedio/chrome-har/pull/68) - thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR!

* Include response canceled by Chrome or user action [#67](https://github.com/sitespeedio/chrome-har/pull/67) - thank you [Michael Dijkstra](https://github.com/mikedijkstra) for the PR!

## 0.11.7 2020-03-09
### Fixed
* And excluded the shrinkwrap file again.

## 0.11.6 2020-03-09
### Fixed
* Exclude the test folder from the release.

## 0.11.5 2020-03-09
### Fixed
* Added a shrinkwrap file.

##  0.11.4 2019-10-16
### Fixed
* Reverted the _initiator field fix since that was an old upstream issue in Chrome [#44](https://github.com/sitespeedio/chrome-har/pull/44).

##  0.11.3 2019-10-14
### Fixed
* Better parsing of the _initiator field fixing an error for some HARs, thank you  [Aleksandr Semyonov](https://github.com/juvirez) for the PR [#44](https://github.com/sitespeedio/chrome-har/pull/44).

##  0.11.2 2019-09-21
### Fixed
* Extra check that we really got a response in the trace [#54](https://github.com/sitespeedio/chrome-har/pull/54)

##  0.11.1 2019-09-14
### Fixed
* Catch if a request misses the response/timings [#53](https://github.com/sitespeedio/chrome-har/pull/53).

## 0.11.0 2019-07-23
### Added
* Include Chrome request id as _requestId to make it simpler in Browsertime to add response bodies  [#50](https://github.com/sitespeedio/chrome-har/pull/50).

## 0.10.0 2019-01-09
### Added
* Support for response bodies, thank you [Michael Cypher](https://github.com/mikeecb) for the PR [#41](https://github.com/sitespeedio/chrome-har/pull/41).

## 0.9.1 2019-01-03
### Fixed
* And also use the URL fragment so we can keep that [#40](https://github.com/sitespeedio/chrome-har/pull/40).

##  0.9.0 2019-01-03
### Added
* Keep hash (#) in URLs. We used to remove them to follow the same path as Chrome but Firefox do not and it breaks later in our tool chain to change the URL [#39](https://github.com/sitespeedio/chrome-har/pull/39).

## 0.8.1 2019-01-03
### Fixed
* Tech: Simplify logic for skipping pages.

## 0.8.0 2019-01-01
### Added
* Skip support for multi page navigation by script (this makes things much easier in Browsertime) [#38](https://github.com/sitespeedio/chrome-har/pull/38).

## 0.7.1 2018-12-13
### Fixed
* Pickup requests/responses that happens before navigation and block some sctript navigations [#36](https://github.com/sitespeedio/chrome-har/pull/36).

## 0.7.0 2018-11-23
### Added
* Catch requestWillBeSent that happens before navigation [#34](https://github.com/sitespeedio/chrome-har/pull/34). This fixes when you click on a link in Chrome that generates a new navigation.

## 0.6.0 2018-11-23
### Added
* Use dayjs instead of moment [#33](https://github.com/sitespeedio/chrome-har/pull/33).
* Support for having a HAR with multiple pages from Browsertime [#30](https://github.com/sitespeedio/chrome-har/pull/30).
* Internal: Split the code to different files to make it easier to read the code [#32](https://github.com/sitespeedio/chrome-har/pull/32).


## 0.5.0 2018-10-12
### Added
* Catch Chrome navigating within page [#28](https://github.com/sitespeedio/chrome-har/pull/28).

## 0.4.1 2018-06-01
### Fixed
* Added extra guard for checking if a response is pushed to fix [sitespeed.io #2068](https://github.com/sitespeedio/sitespeed.io/issues/2068).

## 0.4.0 2018-05-29

### Added
* Including cached entries in the HAR now generates a HAR that validates against the HAR schema.
* Include responses that were pushed with HTTP2. Thanks to Martino Trevisan! [#21](https://github.com/sitespeedio/chrome-har/pull/21)

## 0.3.2 2018-04-07

### Fixed
* Fixes for situations that could result in incorrect HARs (missing startedDateTime or missing first entry).
* Format IPv6 addresses so HARs validate with [har-validator](https://github.com/ahmadnassri/har-validator)

## 0.3.1 2018-03-29

### Fixed
* Also act on Page.frameScheduledNavigation (needed for Chrome 66 and coming Browsertime 3.0)

## 0.3.0 2018-03-15
### Added
* Add more information about request initiator to HAR. Thanks to David Dadon! [#9](https://github.com/sitespeedio/chrome-har/pull/9)

## 0.2.3 2017-10-15

### Fixed
* Prevent creating HAR files with empty pages (i.e. pages with no entries).

## 0.2.2 2017-06-30

### Fixed
* Be extra careful when parsing JSON see [#4](https://github.com/sitespeedio/chrome-har/issues/4)

## 0.2.1 2017-05-31

### Fixed
* Remove unused files from npm distribution.

### 0.2.0 2017-05-31
## Added

* Add "serverIPAddress" field to entries.
* Set bodySize for requests correctly.
* Set bodySize and compression for responses correctly.
* Add _transferSize field for responses, just like Chrome does.

## 0.1.0 2017-03-05
### Added
* Initial release
