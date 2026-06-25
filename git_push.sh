#!/usr/bin/env bash
# git_push.sh — stage everything, commit, and push to GitHub.
# Usage:  ./git_push.sh "your commit message"
# If you omit the message, a timestamp is used.
#
# First-time setup (run once):
#   git init
#   git branch -M main
#   git remote add origin https://github.com/<you>/canto-drop.git
set -e

MSG="${1:-"update $(date '+%Y-%m-%d %H:%M')"}"

git add -A
git commit -m "$MSG" || echo "Nothing to commit (or commit failed)."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "$BRANCH"
