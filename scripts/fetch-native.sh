#!/bin/sh
set -e
TAG="${1:?usage: fetch-native.sh <tag>}"
rm -rf game
mkdir game
curl -fL "https://codeload.github.com/authsrng-game/auths-RNG/tar.gz/refs/tags/$TAG" | tar -xz -C game --strip-components=1