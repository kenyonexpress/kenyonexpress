# C135 — PROD REDEPLOY HEAD (2026-11-02)

HEAD: `243c525220835cd06f776024ed4538acda70293a` (branch closeout/v1-final)

## Before
```
$ curl -sI https://www.kenyonexpress.co.il | grep -iE '^(HTTP|x-vercel-id|age|x-vercel-cache)'
HTTP/2 200
age: 4130
x-vercel-cache: STALE
x-vercel-id: sin1::fra1::n9rlr-1793569171433-584a283268bd
```

## Attempt 1 and 2: upload failed (root cause and fix)
```
<claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />
Vercel CLI 60.1.3 (Node.js 25.9.0)
Deploying kenyonexpress
Uploading [--------------------] (0.0B/745.6MB)
Uploading [=====---------------] (186.4MB/745.6MB)
Uploading [==========----------] (372.8MB/745.6MB)
Uploading [===============-----] (559.2MB/745.6MB)
{
  "status": "error",
  "reason": "deploy_failed",
  "message": "fetch failed",
  "next": [
    {
      "command": "vercel deploy --scope kenyonexpress-projects",
      "when": "retry deploy"
    }
  ]
}
Error: fetch failed
Uploading [====================] (745.6MB/745.6MB)
exit=1
```
Cause: the working-tree upload was 745MB–1.4GB (.claude/worktrees, refs/, wp_import/, .lighthouseci/) and the stream died with `fetch failed`.
Fix: added anchored local-dir excludes to .vercelignore (commit 243c52522), then deployed a clean `git archive HEAD` export (123M) linked to prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP, so exactly HEAD ships.

## Attempt 3: deploy
```
$ cd /tmp/c135-head && vercel deploy --prod --yes --force --archive=tgz --scope kenyonexpress-projects
    "url": "https://kenyonexpress-fd9qnt86f-kenyonexpress-projects.vercel.app",
    "inspectorUrl": "https://vercel.com/kenyonexpress-projects/kenyonexpress/9aTp3gF7NPnVTYkdCyMtG6kJ5zKp",
    "readyState": "READY",
    "target": "production",
  "message": "Deployment kenyonexpress-fd9qnt86f-kenyonexpress-projects.vercel.app ready.",
exit=0
```

```
$ vercel inspect kenyonexpress-fd9qnt86f-kenyonexpress-projects.vercel.app --scope kenyonexpress-projects
    id		dpl_9aTp3gF7NPnVTYkdCyMtG6kJ5zKp
    target	production
    status	● Ready
    created	Mon Nov 02 2026 05:17:09 GMT+0700 (Indochina Time) [2m ago]
    ╶ https://www.kenyonexpress.co.il
    ╶ https://kenyonexpress.co.il
```

## After
```
$ curl -sI https://www.kenyonexpress.co.il | grep -iE '^(HTTP|x-vercel-id|age|x-vercel-cache)'
HTTP/2 200 
age: 21
x-vercel-cache: HIT
x-vercel-id: sin1::kth5v-1793571570421-cdce7be5e4f2
```

Gate: readyState READY, target production, aliased to www.kenyonexpress.co.il + kenyonexpress.co.il,
x-vercel-id changed from `n9rlr-1793569171433-584a283268bd` to a new request id (age reset).

RESULT: DONE
