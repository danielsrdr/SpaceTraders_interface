#!/usr/bin/env bash
# Commit tous les changements (suivis et non suivis) de la branche courante.
#
# Usage : scripts/auto-commit.sh "<résumé de la tâche>" [agent]
#
# Variables :
#   AUTO_COMMIT_BRANCH  si définie, le script refuse de commiter sur une autre branche
#   AUTO_COMMIT_PUSH    "1" pour pousser après le commit (désactivé par défaut)
set -euo pipefail

task="${1:-tâche terminée}"
agent="${2:-}"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ -n "${AUTO_COMMIT_BRANCH:-}" && "$branch" != "$AUTO_COMMIT_BRANCH" ]]; then
  echo "auto-commit : branche « $branch » ≠ « $AUTO_COMMIT_BRANCH », rien fait." >&2
  exit 0
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "auto-commit : aucun changement sur « $branch »."
  exit 0
fi

git add -A

subject="chore(auto): ${task}"
[[ -n "$agent" ]] && subject="${subject} [${agent}]"

body="$(git diff --cached --stat)"
git commit -q -m "$subject" -m "$body" \
  -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"

echo "auto-commit : $(git rev-parse --short HEAD) sur « $branch » — $subject"

if [[ -n "${AUTO_COMMIT_PUSH_TO:-}" ]]; then
  # Le lead pousse HEAD directement sur la branche cible (ex. master), sans PR.
  git push -q origin "HEAD:${AUTO_COMMIT_PUSH_TO}"
  echo "auto-commit : poussé HEAD sur origin/${AUTO_COMMIT_PUSH_TO}"
elif [[ "${AUTO_COMMIT_PUSH:-0}" == "1" ]]; then
  git push -q origin "$branch"
  echo "auto-commit : poussé sur origin/$branch"
fi
