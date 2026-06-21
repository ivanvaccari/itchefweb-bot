#!/bin/bash

IMAGENAME="ivaccari/itchefweb-bot:1.0.0"

rm -rf dist
npm run build
docker build -t $IMAGENAME .
