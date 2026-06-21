#!/bin/bash

IMAGENAME="autocamst"

rm -rf dist
npm run build
docker build -t $IMAGENAME .
