# SwarmUI Extensions

This directory contains installed extensions for SwarmUI.

## Extension Structure

Each extension must be in its own directory and contain a `manifest.json` file:

```
extensions/
  my-extension/
    manifest.json    # Required: Extension metadata
    main.js          # Entry point (specified in manifest)
    theme.json       # Optional: Theme definitions
    ...
```

## Manifest Format

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A sample extension",
  "author": "Your Name",
  "main": "main.js",
  "category": "tool",
  "contributes": {
    "themes": [],
    "languages": [],
    "commands": []
  }
}
```

## Categories

- `theme` - Visual themes and color schemes
- `language` - Language support and syntax highlighting
- `tool` - Developer tools and utilities
- `integration` - Third-party service integrations

## Installing Extensions

Extensions can be installed via:
1. The Extension Manager UI in the IDE tab
2. API: `POST /api/extensions` with `{ source: "local", path: "/path/to/extension" }`
3. Manually copying the extension folder to this directory

## Creating Extensions

1. Create a new directory in `extensions/`
2. Add a valid `manifest.json`
3. Implement your extension logic in the main entry point
4. Restart SwarmUI or refresh extensions to load
