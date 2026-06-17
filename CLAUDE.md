# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**春蝉 (ChunZen)** — A VSCode extension for immersive academic paper reading. Opens PDFs in a custom editor with real-time sentence-level translation (hover triggers translation) and journal metadata lookup (IF, CAS ranking, JCR quartile).

## Build & Run

```bash
npm run compile          # webpack multi-target build → dist/{extension,panel,pdfViewer}.js
npm run watch            # webpack --watch
npm run package          # production build (for vsce package)
npm run lint             # eslint src --ext ts
```

Press F5 in VSCode to launch the Extension Development Host.

## Architecture

```
src/
├── extension.ts                     # Entry point: creates services, wires providers
├── pdfEditor/
│   └── PdfEditorProvider.ts         # CustomReadonlyEditorProvider for *.pdf — HTML template refs dist/pdfViewer.js
├── sidePanel/
│   └── SidePanelProvider.ts         # WebviewPanel in ViewColumn.Two — HTML template refs dist/panel.js + panel.css
├── services/
│   ├── translationService.ts        # Multi-engine orchestration with fallback chain
│   ├── cacheService.ts              # LRU memory cache + disk persistence (translation-cache.json)
│   ├── journalService.ts            # Scrapes LetPub for IF, CAS ranking, JCR quartile, warning status
│   ├── doiExtractor.ts              # Regex-based DOI/ISSN/journal-name extraction from PDF text
│   ├── glossaryService.ts           # CRUD for terminology, persisted in globalState
│   ├── historyService.ts            # Translation history with LRU cap, persisted in globalState
│   ├── configService.ts             # Typed wrapper over VSCode settings + secrets
│   └── engines/
│       ├── baiduEngine.ts           # Baidu Translate API (MD5 signing)
│       ├── deeplEngine.ts           # DeepL API (free/pro)
│       ├── openaiEngine.ts          # OpenAI-compatible chat API + Custom HTTP engine
│       └── claudeCliEngine.ts       # Calls `claude -p` via execFile
├── types/
│   ├── messages.ts                  # All webview↔extension message types (PdfViewerToExt, ExtToPanel, PanelToExt)
│   ├── models.ts                    # TranslationResult, JournalInfo, GlossaryEntry, TranslationHistoryEntry
│   └── config.ts                    # EngineConfig, JournalSource, GeneralSettings
├── utils/
│   └── nonce.ts                     # CSP nonce generator shared by both providers
└── webviews/
    ├── sidePanel/                   # Preact app (built → dist/panel.js)
    │   ├── index.tsx                # Mount Preact app
    │   ├── App.tsx                  # Root: message listener, tab routing, state dispatch
    │   ├── vscode.ts                # Typed postMessage wrapper
    │   ├── components/
    │   │   ├── TabBar.tsx
    │   │   ├── TranslationTab.tsx   # Original text, translation result, history
    │   │   ├── JournalTab.tsx       # Journal name, badges (IF/CAS/JCR/warning), ISSN, DOI
    │   │   ├── GlossaryTab.tsx      # Term list + search + add/edit/delete
    │   │   ├── SettingsTab.tsx      # Engine status, journal source, general settings
    │   │   └── ExportButton.tsx     # Export translations as markdown or bilingual
    │   ├── state/                   # @preact/signals modules
    │   │   ├── translation.ts
    │   │   ├── journal.ts
    │   │   ├── glossary.ts
    │   │   ├── settings.ts
    │   │   └── ui.ts
    │   └── styles/panel.css
    └── pdfViewer/                   # Vanilla TypeScript (built → dist/pdfViewer.js)
        ├── index.ts                 # Entry: load PDF, render, toolbar, event binding
        ├── pdfRenderer.ts           # PDF.js document/page loading + canvas rendering
        ├── textLayer.ts             # Text extraction, line grouping, sentence segmentation, span creation
        ├── selection.ts             # Mouse text selection → postMessage
        └── styles/pdfViewer.css
```

### Data Flow

1. User opens a `.pdf` → `PdfEditorProvider` renders PDF.js webview (HTML shell + `dist/pdfViewer.js`)
2. PDF.js extracts text content, groups by lines, merges into paragraphs, splits into sentences
3. Each text span gets `data-sentence-id`; mouse hover (300ms debounce) sends `{type: 'sentence-hover', text}` to extension
4. `handleSentenceHover()` calls `TranslationService.translate()` with multi-engine fallback, records in `HistoryService`
5. Results posted to `SidePanelProvider` → Preact webview renders in active tab
6. DOI/ISSN/journal extracted from first-page PDF text → `JournalService` query → panel journal tab
7. Side panel tabs: Translation (live), Journal (auto-populated), Glossary (user-managed), Settings (engine status + config)

### Webpack Multi-Target Build

Three configs in `webpack.config.js`:
- **extension** — target: node, entry: `src/extension.ts` → `dist/extension.js` (commonjs2)
- **panel** — target: web, entry: `src/webviews/sidePanel/index.tsx` → `dist/panel.js` (Preact bundle)
- **pdfViewer** — target: web, entry: `src/webviews/pdfViewer/index.ts` → `dist/pdfViewer.js`

Providers reference built artifacts in `dist/`, not source files.

### State Management (Side Panel)

`@preact/signals` — 5 modules:
- `translation.ts` — current result, history list, loading, error
- `journal.ts` — current JournalInfo
- `glossary.ts` — GlossaryEntry[], search filter, editing state
- `settings.ts` — engine statuses, priority, journal source, cache size
- `ui.ts` — active tab

Panel sends `request-state` on mount; extension responds with `init-state` containing glossary, history, engines, and config.

### Communication Protocol

All message types in `src/types/messages.ts`:
- **PdfViewerToExtMessage**: `ready`, `sentence-hover`, `sentence-click`, `text-select`, `doi-found`
- **ExtToPanelMessage**: `init-state`, `translate-result`, `translate-error`, `update-journal`, `engines-status`, `engine-test-result`, `glossary-sync`, `history-sync`, `loading`, `error`, `clear`
- **PanelToExtMessage**: `request-state`, `add-term`/`update-term`/`delete-term`, `export-translations`, `clear-cache`, `clear-history`, `test-engine`, `save-engine-config`, `set-engine-priority`, `save-general-settings`, `import-glossary`

### Translation Engine Priority & Fallback

`TranslationService.translate()` reads `chunzen.translation.priority` config, iterates in order, skips unconfigured engines, returns first successful result. Results cached in-memory (LRU) with disk persistence.

### Glossary & History Persistence

- **GlossaryService** — terms stored in `globalState` as JSON array, max 1000 entries
- **HistoryService** — translations stored in `globalState`, max 100 entries, LRU

## Key Technical Details

- **Preact 10.x + @preact/signals** for side panel webview (~5KB bundled)
- **PDF.js 3.11.174** loaded from CDN in the PDF viewer webview (not bundled)
- **CSP nonce** generated per webview HTML via `utils/nonce.ts`
- **Single webview per document**: `supportsMultipleEditorsPerDocument: false`
- **Bundled** by webpack (only `vscode` is external); vsix packaged with `--no-dependencies` (no `node_modules` shipped)
- **No test framework** is currently configured
- **tsconfig**: `jsx: "react-jsx"`, `jsxImportSource: "preact"`