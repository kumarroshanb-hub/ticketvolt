# TiketVault Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Product/system architecture, tenancy, domains, services, security, deployment, constraints |
| [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) | Actors, roles, modules, workflows, validation, API catalogue and complete field data dictionary |
| [WORKFLOWS.md](WORKFLOWS.md) | End-to-end Mermaid diagrams starting with organisation creation |

## DOCX versions

Word versions are generated from the Markdown sources:

- `TiketVault_Architecture.docx`
- `TiketVault_Functional_Specification.docx`
- `TiketVault_Workflows.docx`

The DOCX files embed rendered Mermaid diagrams. Very tall workflow diagrams are split across consecutive pages with overlap so the labels remain legible.

## Rendering Mermaid

The workflow and architecture documents use Mermaid code blocks. Render them with:

- GitHub / GitLab Markdown preview
- VS Code Mermaid extension
- Mermaid Live Editor (`mermaid.live`)
- Any Markdown renderer with Mermaid support

## Source of truth

The documents are aligned to the Django models, URL configuration and React routes in this repository as of **12 November 2026**. When models or routes change, update the docs alongside the migration/API change.

The field data dictionary in `FUNCTIONAL_SPEC.md` is generated from Django model metadata and includes internal/system fields as well as user-facing fields.
