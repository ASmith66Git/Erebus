#!/bin/bash
set -e

npm install --legacy-peer-deps

npx expo export --platform web
