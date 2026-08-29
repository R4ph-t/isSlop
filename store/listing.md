# Chrome Web Store listing

Copy these into the Store listing and Privacy tabs. Short description must stay at or under 132 characters (this one is 90).

## Short description

Highlight likely AI slop on any page. Nothing leaves the browser. No network, no tracking.

## Detailed description

isSlop marks likely AI-writing tells on the page you are looking at. Click the toolbar icon. The current tab is scanned in the browser. Orange ink lands on the phrases that match the catalog. Hover a mark to see the rule, why it fired, and how often it appears on that page.

It is a pattern highlighter, not a courtroom. Humans use some of these phrases. Density is the product. A high score means the page is thick with known model tics. A low score means it did not trip the catalog. Neither is proof of who wrote it.

WHAT YOU GET

• Inline highlights at three pressures: heavy, medium, and light
• A score from 0 to 100, with a breakdown of how many flags sit in each level
• A findings list. Tap a row to jump to that mark on the page
• Hide highlights to unwrap the marks. Rescan if the page changed

The catalog covers English and French. Spanish runs when the page language matches, and is labeled unverified until a native speaker attests it. The pack is chosen from the page language, then from the words on the page if language is missing.

Nothing is uploaded. No account. No analytics. No model API. The page text never leaves the tab.

Chrome's own pages (chrome:// and the Web Store) cannot be scanned. That is a browser limit, not an isSlop setting.

A hit is a tell you can check. Read the tooltip. Decide for yourself.

## Category

Productivity

## Language

English (listing). The extension also scans French, and Spanish as an unverified pack.

## Privacy tab (paste as needed)

Single purpose: Highlight likely AI-writing patterns on the current tab so the user can inspect them.

Does this extension collect, use, or share user data? No.

Remote code: No.

Permission justifications

activeTab: The scan runs only on the tab where the user opened isSlop. We do not get a standing right to every site.

scripting: Used to inject the highlighter and the local scan script into that tab, and to remove them when the user hides highlights.

Data use: Page text is read in the tab, scored locally, and never sent over the network. Nothing is stored on a server. Highlights live in the page until the user hides them or leaves.
