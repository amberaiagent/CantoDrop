# git_push.ps1 — stage everything, commit, and push to GitHub.
# Usage (PowerShell, from the project folder):
#   .\git_push.ps1 "your commit message"
# If you omit the message, a timestamp is used.
#
# First-time setup (run once):
#   git init
#   git branch -M main
#   git remote add origin https://github.com/<you>/canto-drop.git

param([string]$Message = "")

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "Nothing to commit (or commit failed)."; }

# push current branch to origin, setting upstream the first time
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git push -u origin $branch
