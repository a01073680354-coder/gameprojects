# Night of Neon - AI Development Rules

## Project
- Project name: Night of Neon
- Genre: Cyberpunk sword-action game
- Platform: Web browser
- Preserve the current HTML/CSS/JavaScript technology stack.
- Treat the existing working game as the source of truth.

## Development rules
1. Read relevant existing code before implementing changes.
2. For large changes, propose a plan before editing.
3. Implement one feature or one related group of fixes at a time.
4. Never remove or replace working features without explicit approval.
5. Preserve existing controls, combat mechanics, game progression, UI, and saves where present.
6. Do not rewrite the entire project unless explicitly requested.
7. Do not add frameworks, libraries, or external dependencies without approval.
8. Preserve the original Lite version as a fallback unless explicitly instructed.
9. Explain which files were modified and why.
10. Do not claim a test passed unless it was actually run.

## Validation
- Check for JavaScript syntax errors when tooling is available.
- Check for browser console errors when browser testing is available.
- Verify the requested feature and potential regressions.
- Report any tests that could not be performed.
- Ask for approval before destructive operations or major architectural changes.

## Development priorities
1. Existing functionality and data safety
2. Correct gameplay behavior
3. Maintainable code
4. Game feel and presentation
5. Additional features
