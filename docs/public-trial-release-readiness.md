# Public-trial release readiness

## 2026-09-26 capability and artifact checks

Updated by Codex / GPT-6. The release manifest now records all runtime network capabilities: cloud sync, AI, OCR, online pictograms and dialect recognition, plus collaboration, account closure and public-trial flags. Build configuration reuses the runtime capability resolver so an explicitly disabled feature stays disabled in preview as well as production.

Formal readiness checks require a complete manifest and the production channel. API and ARASAAC legal-domain confirmations are required when the actual artifact uses those services; a missing or older incomplete manifest cannot waive them. Offline-default candidates still need filing, privacy, material licenses, WechatSI authorization, core real-device acceptance and a performance scan. WechatSI is itself an online plugin, so “optional API features disabled” does not mean all functionality works offline.

The current default production settings disable optional cloud/API features. That candidate is not the requested cloud-collaboration trial. A public-trial candidate must explicitly enable and verify cloud, collaboration and account closure, use the approved API endpoint, and pass the existing network/device acceptance gates. No local build or synthetic test supplies those external approvals.

Review a specific candidate with `npm run check:release-readiness -- --dist <built-dist>`. Do not copy successful flags from an earlier build or fill missing confirmations solely because source code exists. Keep the public-trial intent explicit in the readiness JSON; the example defaults to false and does not turn on public services.

Formal public-trial readiness requires `publicTrial` to be an explicit boolean in the local readiness JSON. Run the existing gate with `npm run check:release-readiness -- --dist <built-dist>` when validating an isolated build.

The gate checks the build manifest, production channel, client API endpoint, collaboration/cloud/public-trial flags, source revision, complete dist fingerprint, and tracked source cleanliness. It validates the mini client artifact only; it does not prove the API service flags or a live backend. Development and offline builds may keep collaboration disabled.

Updated: 2026-09-17 18:10:12 (Asia/Shanghai). Implementation: Codex / GPT-5.6 Luna. Review and verification: Codex / GPT-6 Astra.

