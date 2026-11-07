---
name: table-formatting
description: Format tabular information clearly in Markdown and other text-based responses. Use when creating, editing, or repairing tables, or when deciding whether information should be presented as a table.
---

# Table Formatting

Use this skill whenever a response contains information arranged into rows and columns. Optimize for accurate, scannable output across Markdown renderers, chat interfaces, and narrow screens.

## Choose the Right Structure

- Use a table for compact, comparable information with a small number of consistent fields, such as options, specifications, schedules, or before-and-after values.
- Use prose or a list for explanations, sequential steps, long passages, or content whose cells would contain multiple sentences.
- Avoid tables with only one column, nested tables, and tables used only for visual decoration.
- Keep tables narrow. Include only columns that help answer the user's question, and do not repeat the same information in every row.
- If a table would be difficult to scan on a phone, prefer a short list with a repeated label/value pattern.

## Markdown Syntax

- Include one header row and a separator row. Keep the same number of cells in every row.
- Use a single `|` between cells and escape literal pipe characters as `\|`.
- Keep cell content concise. Do not put block-level content, multi-paragraph text, or code fences inside cells.
- Use inline code for literal identifiers, commands, paths, or short code values when useful; do not put ordinary prose in code formatting.
- Use standard Markdown table syntax rather than HTML unless the user or target renderer explicitly requires HTML.

Example:

| Option | Best for | Limitation |
| --- | --- | --- |
| CSV | Simple data exchange | Does not preserve formatting |
| JSON | Nested structured data | More verbose for flat data |

## Alignment and Content

- Left-align text by default. Right-align numeric values when comparing magnitudes; use consistent precision and units within a column.
- Use centered alignment only for short values where it improves scanning, such as status symbols or compact labels.
- Put units in the column header when they apply to every value, for example `Duration (ms)`.
- Make headers short, descriptive, and distinct. Do not leave a header blank; use a clear label such as `Notes` when needed.
- Preserve the source's meaning, order, distinctions, and uncertainty. Do not invent missing values or silently normalize meaningful differences.
- Represent unavailable values consistently, using `Not provided` or an em dash where appropriate; explain ambiguous notation outside the table.
- Keep dates, currencies, percentages, and number precision consistent within their columns.
- Do not use color, alignment, or Unicode box drawing as the only way to convey meaning.

## Before Returning a Table

Check that:

1. A table is more useful than prose or a list for this content.
2. The header describes each column and every row has the correct number of cells.
3. Literal pipe characters are escaped and Markdown syntax is valid.
4. Values, units, ordering, and missing-data markers are consistent and faithful to the source.
5. Cells are concise enough to scan in the target chat or document.