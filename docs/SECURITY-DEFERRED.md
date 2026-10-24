# Security Vulnerabilities - Deferred

This document tracks security vulnerabilities that have been identified but are deferred from immediate remediation, with justification for each deferral.

Last updated: 2026-10-25

## Summary

| Package | Severity | CVE | Status | Justification |
|---------|----------|-----|--------|---------------|
| uuid    | Moderate | CVE-2026-41907 | Deferred | Dev dependency, low exploitability |

## Deferred Vulnerabilities

### uuid: Missing buffer bounds check (CVE-2026-41907)

**Severity:** Moderate (CVSS 6.3/7.5)  
**Advisory:** GHSA-w5hq-g745-h8pq  
**Vulnerable version:** uuid < 11.1.1  
**Installed version:** 7.0.3 (via @capacitor/cli > xcode)  
**Patched version:** ≥ 11.1.1

#### Description

The `v3()`, `v5()`, and `v6()` API methods in the uuid library accept external output buffers but do not reject out-of-range writes (small buffer or large offset). This inconsistency allows silent partial writes into caller-provided buffers, which can produce malformed or truncated identifiers without error.

#### Affected Path

```
.>@capacitor/cli@8.5.3>xcode@3.0.1>uuid@7.0.3
```

#### Justification for Deferral

1. **Development dependency only**: uuid is pulled in through @capacitor/cli, which is a devDependency used only during the mobile build process, not in production runtime code.

2. **Limited scope**: The vulnerability affects only the v3/v5/v6 methods when called with custom buffer parameters - a specific usage pattern unlikely to be present in build tooling.

3. **Upstream dependency**: The vulnerable uuid version is a transitive dependency of the xcode package (v3.0.1), which is itself a dependency of @capacitor/cli. There is no newer stable version of @capacitor/cli (currently 8.5.3) that resolves this issue.

4. **Low exploitability**: The vulnerability requires:
   - Calling specific uuid methods (v3/v5/v6, not v1/v4/v7)
   - Providing custom buffer parameters
   - Controlling buffer size or offset parameters
   - This specific usage pattern is not present in the xcode or @capacitor/cli codebase

5. **Impact classification**: The primary impact is an integrity/robustness issue (silent partial output), not a direct security vulnerability like code execution or data exposure.

#### Mitigation

- Override attempts were unsuccessful as pnpm overrides do not affect nested devDependencies in this specific dependency chain
- The vulnerability will be resolved when:
  - The xcode package is updated to use uuid ≥ 11.1.1, or
  - @capacitor/cli updates its dependency on xcode to a version without this vulnerability

#### Monitoring

- Check quarterly for updates to @capacitor/cli or xcode packages
- Re-evaluate if uuid is added as a direct dependency or if the exploit context changes
- Run `pnpm audit` before major releases to ensure no new high/critical vulnerabilities are introduced

#### References

- GitHub Advisory: https://github.com/advisories/GHSA-w5hq-g745-h8pq
- CVE: https://nvd.nist.gov/vuln/detail/CVE-2026-41907
- Fixed in uuid releases: v11.1.1, v12.0.1, v13.0.1, v14.0.0
