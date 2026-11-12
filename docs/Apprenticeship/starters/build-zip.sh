#!/bin/sh
# Rebuild ollama-chat.zip from the ollama-chat/ folder next to this script.
# The zip is what gets sent to Charlie over Slack; the folder is the source of
# truth. Run this after changing anything in ollama-chat/.
#
#   sh docs/Apprenticeship/starters/build-zip.sh
#
# No .git goes in: Charlie creates his own repo and makes the first commit.
set -e
cd "$(dirname "$0")"
rm -f ollama-chat.zip
zip -rq ollama-chat.zip ollama-chat -x '*/.git/*' '*/.git' '*/.DS_Store'
echo "wrote $(pwd)/ollama-chat.zip"
unzip -l ollama-chat.zip | tail -2
