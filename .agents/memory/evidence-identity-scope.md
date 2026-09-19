---
name: POC evidence identity scope
description: Why evidence intake and adjudication use contextual identity instead of a new account system.
---

For this proof of concept, constrain evidence uploads to a validated high-entropy capture identifier and derive project, site, crew, and work context server-side. Adjudication records a required reviewer name, but it does not introduce a company-wide authentication system.

**Why:** Adding broad authentication solely for evidence review would expand the product scope substantially. The agreed control is contextual intake plus explicit, append-only named-review decisions.

**How to apply:** Preserve this boundary when extending evidence or review features. Add authenticated reviewer identity only if the user explicitly expands the POC into an account/authorization project.