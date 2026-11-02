# C170 cleanup: track pending docs, gitignore local settings

```
$ git log -1 --stat --oneline 1f512a67b
1f512a67b cleanup: track pending docs, gitignore local settings
 .gitignore             |  1 +
 docs/C125-money.md     | 35 +++++++++++++++++++++++++++++++++++
 docs/M-CYCLE-STATUS.md |  4 ++--
 docs/M08-c343.md       | 15 +++++++++++++++
 4 files changed, 53 insertions(+), 2 deletions(-)

$ git check-ignore -v .claude/settings.local.json
.gitignore:84:.claude/settings.local.json	.claude/settings.local.json

$ git ls-remote origin closeout/v1-final (before this proof commit)
1f512a67b8c0d7516c6fcec2a12a8e875f075980	refs/heads/closeout/v1-final
```
