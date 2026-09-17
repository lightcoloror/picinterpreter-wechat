# Public-trial release readiness

Formal public-trial readiness requires `publicTrial` to be an explicit boolean in the local readiness JSON. Run the existing gate with `npm run check:release-readiness -- --dist <built-dist>` when validating an isolated build.

The gate checks the build manifest, production channel, client API endpoint, collaboration/cloud/public-trial flags, source revision, complete dist fingerprint, and tracked source cleanliness. It validates the mini client artifact only; it does not prove the API service flags or a live backend. Development and offline builds may keep collaboration disabled.

Updated: 2026-09-17 18:10:12 (Asia/Shanghai). Implementation: Codex / GPT-5.6 Luna. Review and verification: Codex / GPT-6 Astra.

