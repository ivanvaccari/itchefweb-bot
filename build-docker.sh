#!/bin/bash

# fix git-bash expansion su windows
export MSYS_NO_PATHCONV=1

PACKAGEVERSION=$(node -p "require('./package.json').version")
IMAGENAME="ivaccari/itchefweb-bot:$PACKAGEVERSION"

echo "Building docker image $IMAGENAME"

rm -rf dist
npm run build
docker build -t $IMAGENAME .

# Ask for push 
echo "Pushare immagine su dockerhub? (y/n)"
read answer
if [ "$answer" != "${answer#[Yy]}" ] ;then
    docker push $IMAGENAME
fi