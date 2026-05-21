// Text selection handling for PDF viewer

interface VscodeApi {
  postMessage(msg: unknown): void;
}

export function setupSelectionHandler(textLayer: HTMLElement, vscode: VscodeApi): void {
  let selectionTimer: ReturnType<typeof setTimeout> | null = null;

  document.addEventListener('mouseup', () => {
    if (selectionTimer) clearTimeout(selectionTimer);

    selectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (text.length < 5) return;

      // Verify selection is within the text layer
      if (selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!textLayer.contains(range.commonAncestorContainer)) return;

      vscode.postMessage({ type: 'text-select', text });
    }, 400);
  });
}

export function setupClickHandler(
  spanToSentence: Map<HTMLSpanElement, string>,
  sentences: Map<string, { text: string }>,
  vscode: VscodeApi
): void {
  // Use mouseover/mousedown to detect sentence hover
  // Click-to-translate is handled in the main index.ts via event delegation
}