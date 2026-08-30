(() => {
  try {
    if (window._docs_annotate_canvas_by_ext) return;
    // Google Docs only emits canvas text (SVG aria-labels) for a short
    // allowlist of extension IDs. Grammarly's ID is on that list; ours is not.
    window._docs_annotate_canvas_by_ext = 'kbfnbcaeplbcioakkpcpgfkobkghlhen';
  } catch {
    /* page may freeze the window object */
  }
})();
