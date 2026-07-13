#!/usr/bin/env bash
# Build the self-contained itch.io zip from the current working tree.
# Run this at each milestone, then upload blaze-runner-itch.zip to itch.io.
set -e
cd "$(dirname "$0")"
rm -rf blaze-runner-deploy blaze-runner-itch.zip
mkdir blaze-runner-deploy
# news.html is intentionally omitted — it's a website-only updates page
cp index.html game.js changelog.js phaser.min.js cover.png blaze-runner-deploy/
( cd blaze-runner-deploy && zip -q -r ../blaze-runner-itch.zip . )
echo "Built blaze-runner-itch.zip:"
unzip -l blaze-runner-itch.zip
