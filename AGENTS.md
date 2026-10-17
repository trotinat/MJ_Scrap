# Project preferences

- Consult the Graphify skill first for codebase work. Reuse an existing graph and bounded queries when available; avoid unnecessary rebuilding.
- For UI work, read DESIGN.md and consult the relevant reference in VoltAgent/awesome-design-md.
- Apply Vercel Labs' Web Interface Guidelines when building or reviewing UI: https://github.com/vercel-labs/web-interface-guidelines. Read the relevant sections; keep checks focused and output concise.
- Keep replies and tool output concise to conserve tokens. Write compact, readable code.
- Prioritize deal accuracy, personal relevance and iPhone usability. Preserve existing uncommitted work.
- After app code changes, build the web app and worker, deploy the latest compiled web app to the private Tailscale phone URL, and verify it before finishing. Build Next.js in an isolated, inactive dist directory; keep the current phone version serving until the new one is healthy.

