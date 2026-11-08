# Security Policy

Thanks for taking the time to look into the security of WABA-CRM.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security bugs.** Public issues are indexed by search engines and visible to everyone before a fix is published.

Instead, please report privately via one of:

- [GitHub Security Advisories](https://github.com/shahzebiqbalkhan/Waba-CRM/security/advisories/new) (preferred — keeps the disclosure, fix, and CVE all in one place).
- Email: `shazepaperkhan@gmail.com` with `[WABA-CRM Security]` in the subject.

Include, if you can:

- A description of the issue and the impact.
- Reproduction steps or a proof-of-concept.
- The commit or release you're testing against.
- Whether you'd like credit in the eventual disclosure (we default to crediting by the name or handle you give us, unless you prefer anonymous).

## What to Expect

- **Acknowledgement** within 48-72 hours.
- **Initial assessment** (severity, affected versions, whether a workaround exists) within one week.
- **Fix + coordinated disclosure** on a timeline proportional to severity. Critical issues ship a patch as soon as one's ready; medium issues bundle with the next release.

## Scope

In scope:
- Anything in this repository (`shahzebiqbalkhan/Waba-CRM`), including webhook and auth flows, token encryption, RLS policies, and the built-in cron endpoints.
- Default configurations shipped in `docs/` — e.g. if the setup guide leaves an unsafe default.

Out of scope:
- Vulnerabilities in Supabase, Next.js, Node.js, or other upstream dependencies — please report those to their respective maintainers.
- Issues that require a pre-compromised deployment (e.g. a leaked service-role key) unless they widen the blast radius beyond the initial compromise.
- Social engineering, physical attacks, or third-party services added after deploy.
