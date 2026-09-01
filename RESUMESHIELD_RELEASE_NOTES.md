# ResumeShield release notes

## Added

- `public/tools/resume-privacy-scanner.html`: browser-local resume privacy scanner with three sharing modes, explainable findings, user-controlled redaction, clipboard copy, and TXT download.
- `public/guides/resume-privacy-before-sharing.html`: original educational guide with practical sharing guidance and authoritative sources.
- Aggregate-only scan counter endpoint in `src/worker.js`. The request contains no resume text or scan result.

## Integrated

- Added ResumeShield links to the homepage.
- Added the guide to the guide index and author page.
- Added both URLs to `sitemap.xml`.
- Updated the privacy policy to describe ResumeShield's local processing.

## Deployment

Commit the changed files and push to the branch Cloudflare Pages/Workers deploys. After deployment, test `/tools/resume-privacy-scanner` in a private browser window, then request indexing for the tool and guide in Google Search Console.
