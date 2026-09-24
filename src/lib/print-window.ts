/**
 * Shared print-window helper.
 *
 * Opens a NEW, isolated browser window containing only the fully
 * self-contained report HTML (inline styles — no dependency on the main
 * app's stylesheet loading in the new window), and calls window.print() on
 * that new window ONLY after its content (and images) have fully loaded.
 *
 * Used by both the Main Book printable report and the classroom kiosk
 * weekly DCF record so there is exactly ONE print-window implementation.
 *
 * Browser-only (touches window). Call from an event handler / callback.
 */
export function openPrintWindow(documentHtml: string): void {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=1100,height=850");
  if (!w) {
    // Pop-ups blocked — fall back to printing the current page.
    alert("Please allow pop-ups to open the print preview.");
    return;
  }

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      w.focus();
      w.print();
      // Close the helper window shortly after the print dialog is dismissed.
      setTimeout(() => {
        try {
          w.close();
        } catch {
          /* ignore */
        }
      }, 800);
    } catch {
      /* ignore */
    }
  };

  w.document.open();
  w.document.write(documentHtml);
  w.document.close();

  // Wait for the new document (and its images, e.g. the koala logo) to
  // fully load before invoking the print dialog — printing immediately
  // after opening is what produced blank printouts.
  if (w.document.readyState === "complete") {
    setTimeout(doPrint, 350);
  } else {
    w.onload = () => setTimeout(doPrint, 120);
    // Fallback in case onload never fires (some embedded webviews).
    setTimeout(doPrint, 1600);
  }
}
