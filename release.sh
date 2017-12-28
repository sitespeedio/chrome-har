#!/bin/bash
set -e

# npm install --global np
np $1

PACKAGE_VERSION=$(node -e 'console.log(require("./package").version)')

echo $PACKAGE_VERSION  > ../sitespeed.io/docs/_includes/version/chrome-har.txt