#!/bin/bash
set -e

# npm install --global np
np $1

PACKAGE_VERSION=$(node -e 'console.log(require("./package").version)')

echo $PACKAGE_VERSION  > ../sitespeed.io/docs/version/chrome-har.txt