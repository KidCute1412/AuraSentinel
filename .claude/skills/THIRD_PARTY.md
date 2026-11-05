# Third-party skills (vendored, reviewed)

Each was cloned shallow into a scratch directory, read (SKILL.md + scripts), grepped for network/exec/secret patterns, then copied unmodified. Re-review before updating. Licenses in `_licenses/`.

| Skill(s) | Source | Commit | License | Notes |
|---|---|---|---|---|
| `webapp-testing`, `frontend-design` | https://github.com/anthropics/skills | `ca45fc496a3436251f191354091d557da31c15b5` | per-skill `LICENSE.txt` (Apache-2.0) | Use for dashboard E2E (Playwright, needs `pip install playwright`) and UI polish. `with_server.py` only runs the command you pass it. |
| `secure-workflow-guide` | https://github.com/trailofbits/skills (`plugins/building-secure-contracts`) | `470419e16f97e112d01fc32f4898aea1755015d9` | CC BY-SA 4.0 (`_licenses/trailofbits-CC-BY-SA-4.0.txt`) | Only the Slither + fuzz/invariant workflow skill is kept. Attribution to Trail of Bits required; derivatives stay ShareAlike. |
| `nestjs-best-practices` | https://github.com/kadajett/agent-nestjs-skills | `3986e0cede33958e000f959031cbee0cd83c2941` | MIT (declared in frontmatter) | Generic NestJS rules; our `nest-module-scaffold` and `agentshield-invariants` take precedence on conflicts (e.g. we use `nestjs-zod`, not class-validator). |
| `viem`, `wagmi` | https://github.com/0xsardius/onchain-typescript-skills | `098575e6c3c2f918b5cca41d8d734d6dcd76485b` | MIT (`_licenses/0xsardius-MIT.txt`) | **Version mismatch:** `wagmi` skill targets wagmi v3; our docs say wagmi v2. Pin the version in `apps/web/package.json` first and treat API differences in that skill as suspect. |
| `react-best-practices`, `composition-patterns`, `web-design-guidelines` | https://github.com/vercel-labs/agent-skills | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | MIT (declared in frontmatter; repo has no LICENSE file) | UI/React quality. We use Vite, not Next.js: ignore `server-*`/`async-api-routes`/RSC rules in `react-best-practices`. **Modified:** `web-design-guidelines` originally fetched its rules from GitHub at runtime; we vendored them as `guidelines.md` (from `vercel-labs/web-interface-guidelines` `command.md`, fetched on the commit date) and removed the network step. |
| `shadcn-ui` (upstream name `shadcn`) | https://github.com/shadcn-ui/ui (`skills/shadcn`) | `8a3536678a528cc012b9e62484290e79d0be410f` | MIT (`_licenses/shadcn-ui-MIT.txt`) | Renamed in frontmatter to match the folder. SKILL.md runs `npx shadcn@latest info --json` (pre-allowed) in the project; project uses Radix, not Base UI. |

## Evaluated and not vendored
- `token-integration-analyzer`, `guidelines-advisor`, `code-maturity-assessor`, `audit-prep-assistant` (Trail of Bits): vendored then removed - we only whitelist USDC/WAVAX, the module is not upgradeable, no external audit step, and descriptions overlapped `secure-workflow-guide`.
- `wevm/wagmi` `wagmi-development`: for contributors to the wagmi library itself, not app authors.
- `anthropics/skills` `skill-creator`: already available at user level; heavy Python tooling.
- `trailofbits/skills` `spec-to-code-compliance`, `property-based-testing`, `differential-review`: depend on plugin workflows/other languages. Install as a plugin if wanted: `/plugin marketplace add trailofbits/skills`.
- docx/pdf/pptx/xlsx and art/brand skills: unrelated.
- Tailwind and `ui-ux-pro-max` skills: no source reviewed yet; `shadcn-ui` already covers tokens/theming.

## Precedence
Project invariants (`agentshield-invariants`) override any third-party advice.

## Design precedence
For `frontend-design`, `shadcn-ui` and `web-design-guidelines`: the project skill `ui-design-system` (`docs/product/design-system.md`) wins on look and feel (palette, type, radius, shadows). Use these skills only for structure, a11y and component mechanics.
