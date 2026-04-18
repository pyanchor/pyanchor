# AI UI Edit Request

Target page: /login

## User request
???/???? ???(?)? ?????? ???? ???? ???? ??

## Constraints
- This project uses custom CSS, not Tailwind.
- Preserve route flow, API logic, and data behavior.
- Keep Korean UI copy unless the request explicitly asks for text changes.
- Limit edits to the target page and the shared components/styles it directly uses.
- Prefer production-ready UI changes over placeholder landing-page styling.
- Do not create unrelated files or refactor unrelated areas.

## Project hints
- Start with auth files only: app/(auth)/login/page.tsx, app/(auth)/signup/page.tsx, components/auth/, app/(auth)/layout.tsx, app/globals.css.
- Preserve the Korean UI copy and the existing login/signup behavior.
- Prefer a shared auth component if the change affects both login and signup tabs.
- For this route, animations should be subtle and product-like: short fade/slide transitions, tab indicator movement, no flashy motion.

## Validation
- Review modified files for obvious TypeScript or JSX mistakes before finishing.
- Keep the final response to 2 or 3 concise lines.