# CLAUDE.md

## Handoffs — always link the action (standing rule)

Whenever you hand Emanuel an action to perform himself, ALWAYS include a direct,
clickable link to the exact place to do it. Never describe a location (e.g.
"go to Settings → Git") without also linking it. This applies to every project.

Covers, at minimum:
- External dashboards / services (Vercel, Supabase, Google, Gmail, GitHub Pages, etc.)
- GitHub actions: PRs to merge or review, Actions runs/logs, repo or settings pages
- Token, permission, or billing changes
- Any approval or configuration step that happens outside the code

Format: present the actions Emanuel needs to take as a short checklist, each
line ending in its link. Prefer a deep link to the specific project/settings
page over a generic dashboard root whenever the URL is known or can be
constructed. Do not make him ask for the link.
