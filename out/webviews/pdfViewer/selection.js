"use strict";
// Text selection handling for PDF viewer
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSelectionHandler = setupSelectionHandler;
exports.setupClickHandler = setupClickHandler;
function setupSelectionHandler(textLayer, vscode) {
    let selectionTimer = null;
    document.addEventListener('mouseup', () => {
        if (selectionTimer)
            clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed)
                return;
            const text = selection.toString().trim();
            if (text.length < 5)
                return;
            // Verify selection is within the text layer
            if (selection.rangeCount === 0)
                return;
            const range = selection.getRangeAt(0);
            if (!textLayer.contains(range.commonAncestorContainer))
                return;
            vscode.postMessage({ type: 'text-select', text });
        }, 400);
    });
}
function setupClickHandler(spanToSentence, sentences, vscode) {
    // Use mouseover/mousedown to detect sentence hover
    // Click-to-translate is handled in the main index.ts via event delegation
}
//# sourceMappingURL=selection.js.map