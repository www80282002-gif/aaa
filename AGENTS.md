# Repository Guidelines

## Project Structure & Scope

`報修需求筆記.txt` is the requirements brief for a small repair and issue intake demo. It defines the fields, allowed values, access rules, and open decisions. The planned deliverables are an Excel field list with sample data, a six-slide PowerPoint proposal, a Word user guide, a web form with a request list, and a Supabase table with access policies. Keep these deliverables consistent with the brief and update it when a requirement changes.

## Build, Test, and Development

The workspace currently contains the requirements brief. Build, run, lint, and test commands will depend on the implementation. When adding code, document the commands for local setup, running the app, and testing it. Include the Supabase setup steps needed to reproduce the demo.

## Field Names & Sample Data

Use the Traditional Chinese labels and allowed values in the brief across the form, list, and documentation. If database identifiers differ from the display labels, record the mapping in the Excel field list. Generate the registration timestamp automatically and use fictional names and locations in every sample and screenshot.

## Testing & Access Rules

When the demo is available, submit a fictional request and verify that it appears in the list with the selected category and urgency and an automatically generated timestamp. Enable row-level security (RLS) on the Supabase table. Test with the same public key and unauthenticated access used by the browser. Verify that inserts and reads succeed and that attempted updates and deletes leave stored records unchanged. Login, status updates, and notifications remain open decisions in the brief.

## Commit & Pull Request Guidelines

This workspace has no Git history. If version control is added, use short, action-oriented commit subjects. In a pull request, name the affected deliverables, summarize verification, link a relevant issue if available, and include screenshots for visible changes.
