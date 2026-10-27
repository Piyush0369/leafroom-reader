# Leafroom Reader

[Read online](https://leafroom-reader.web.app/)

Open `index.html` in a modern browser, or serve this directory with `python3 -m http.server 4173` and visit http://localhost:4173. Keep `document-import.js` , `reader-storage.js`, `pdf-layout.js`, `view-gestures.js`, `reading-layout.js`, `paper-dynamics.js`, `paper-surface.js`, and `paper-turn.js` alongside the HTML file.

A vanilla HTML/CSS/JavaScript reader with two-sided 3D leaves, pointer swipes, arrow-key navigation, measured text pagination, a position slider, evening mode, and synthesized pink-noise paper sounds. Includes an original sample book and an SVG botanical cover.

## Supported books

Choose **Open a book** to import a local file up to 25 MB:

- **TXT:** UTF-8 text, paginated for the screen.
- **PDF:** Original pages rendered with PDF.js, including images, diagrams, and scans. Auto layout splits landscape sheets (width/height ≥ 1.2) into left and right leaves to handle PDFs exported as two-page spreads. Choose **PDF layout → Original pages** for intentional landscape pages, or **Split spreads** to force splitting. This choice is saved per book. Reading positions and bookmarks follow original source pages across layout changes. Up to 2,000 pages. Password-protected PDFs must be unlocked first. Canvas-rendered PDF pages do not offer selectable text or OCR.
- **EPUB:** DRM-free books, read in OPF spine order. Book title, cover art, chapter text, and bundled illustrations are imported. EPUB 3 cover-image metadata, EPUB 2 cover metadata, and guide cover pages are supported. Illustrations appear as fitted plates between text pages, with captions and alternative text. PNG, JPEG, GIF, WebP, and SVG image assets are supported, including SVG wrappers around bundled images. Interactive content and publisher styling are omitted. Font-obfuscated EPUBs are supported using Leafroom's fonts. EPUB archives expanding beyond 80 MB are rejected.

TXT and EPUB imports support up to 1 million text characters. Files, bookmarks, and reading positions are saved in IndexedDB on this device; no document content is sent to a server. Failed imports keep the current book available. Reopening the app restores the latest book and its position. Use **Your books** to switch between saved books, **Bookmark** to toggle a bookmark for the current spread, and **Bookmarks** to jump to or remove saved places. Content hashes identify each book, including renamed copies. If screen dimensions change, saved positions and bookmarks map to the nearest corresponding spread. Clearing site data removes the library; private browsing and storage quotas may prevent durable saving. PDF/EPUB restoration requires their CDN reader libraries to be available. A save warning appears if browser storage fails.

PDF.js 4.10.38 and JSZip 3.10.1 load from CDN on demand, requiring a connection on first use. Tone.js also uses a CDN. PDF rendering uses a nearby-page canvas cache; resizing preserves original PDF pages, while text books repaginate and preserve approximate progress. Auto view displays one page at a time on small screens for TXT, PDF, EPUB, and the original sample; the View selector can override this with Single page or Two-page spread. Reduced-motion preferences shorten animations. Page turns include animated lighting, paper-edge depth, and live swipe rotation; short or cancelled swipes settle back into place. Image object URLs are released when a different book is opened.

## Verification

JavaScript syntax checks:

```sh
node --check document-import.js
node --check reader-storage.js
node --check pdf-layout.js
node tests/pdf-layout.test.cjs
```

Browser-tested fixtures in `tests/fixtures/`:

1. Open `sample.epub`: title is “EPUB Reading Test”; first chapter precedes second even though manifest order is reversed. Embedded script must not execute.
2. Open `sample.pdf`: turn the cover; the spread displays two distinct PDF pages and their original green graphics.
3. Open `invalid.epub`: an error appears; the previous book remains readable.
4. Navigate with arrows, slider, or swipes using the same reader controls for each format.

5. Open `illustrated.epub`: the original cover appears, followed by text, a full illustration with its caption, then the remaining text. Nested, URL-encoded image paths resolve locally. Drag a page past the threshold to turn it; release a short drag to restore it.

6. Bookmark an illustrated spread, reload, and verify the same book, spread, and bookmark return. Import a second book and check independent bookmarks/progress using **Your books**. Remove a bookmark and reload to verify the removal persists.

7. Open `spreads.pdf`: Auto shows four portrait reading pages from two landscape PDF sheets. The first spread shows “Printed page 1” and “Printed page 2” separately at full height. Switch to Original pages to see the difference; switch back and reload to verify layout and bookmark persistence.

## Zoom and fullscreen

Use **+ / −** above the book to zoom from 100% to 300% in 25% steps. **Fit** returns to 100% and recenters. Keyboard shortcuts: `+`/`=` to enlarge, `-` to reduce, `0` to fit. Zoom level is saved per uploaded book.

At higher zoom, drag the page, scroll, or use **Shift + arrow keys** to pan. Regular arrow keys and the side buttons still turn pages. Fit restores swipe-to-turn behavior. Panning is bounded to the book so you can reach each page without losing it outside the viewport.

**Fullscreen** hides the surrounding page and fits the book to the available display. Exit with its button or Escape. Browsers that cannot use native fullscreen get a focused reading view instead. PDF canvases re-render for zoom and fullscreen; rendering is capped at 4,096 pixels per dimension and 8 megapixels per page to bound memory use.

Browser verification: zoomed PDF to 200%, dragged without changing spread, reset with Fit, checked larger PDF canvas sizes, and entered native fullscreen. Existing PDF layout checks: `node tests/pdf-layout.test.cjs`.

## Single-page PDF reading

Use **View → Single page** beside the zoom controls to read one logical PDF page at a time, or **Two-page spread** to return to the 3D book spread. PDFs default to single-page view on screens up to 700 pixels wide unless you have already saved a view choice for that book. The choice persists per book. Source-page anchors preserve your exact page, including the right half of a split PDF sheet, across view changes and reloads.

Single-page mode fits the page to the viewport, including mobile and fullscreen, and retains animated page turns. At 100%, swipe left/right to turn; above 100%, drag to pan. Two fingers on the PDF viewport pinch from 100% to 300% around their midpoint. Release both fingers to finish: the reader sharpens the PDF and saves zoom, without turning a page. Gestures are scoped to the reading viewport; the rest of the app can still scroll normally. Browser-level touchscreen testing was not available; the actual pointer handlers are tested with two-pointer sequences.

Additional checks:

```sh
node tests/view-gestures.test.cjs
node tests/reader-pinch.test.cjs
node tests/pdf-layout.test.cjs
```

Browser-checked single-page navigation, switching from a right-hand page to a spread and back, and restoring the saved view and page after reload.

## Flexible page turns

Inspired by the Real3D FlipBook reference (https://real3dflipbook.com/), Leafroom uses an independent WebGL renderer. One indexed mesh with 112 columns and 72 rows rotates as a complete sheet. A shallow, constant-curvature arc bends the whole page, with a normal tangent span of about 25 degrees; a small correction in the outer corner margin adds a subtle curl. The binding stays fixed. Analytic tangents produce continuous lighting, with no separate strips or folded panels. Covers rotate as rigid boards.

Front/back textures come from the current PDF, EPUB, or text page. Dragged turns follow the pointer and settle forward or back; a second touch cancels the preview before pinch zoom begins. Resting pages and the mesh share the same high-resolution page artwork. The original text and image semantics remain in the DOM for accessibility.

GPU buffers, textures, shaders, and the temporary WebGL context are released after each turn. Turn textures follow the displayed page scale and device pixel ratio with 20% perspective headroom and a 2× minimum. Artwork is capped at 12×, 4,096 pixels per edge and ten megapixels; the antialiased animation framebuffer is capped at twelve megapixels and the device renderbuffer limit. High-precision UVs and optional anisotropic filtering preserve text detail through the curl. Reduced-motion settings or unavailable WebGL use the existing short CSS transition. Zoom, single/spread views, bookmarks, progress, and fullscreen remain available.

Validation: `node tests/paper-turn.test.cjs` checks manifold shared edges, whole-page arcs, localized hover cues, preserved printed lengths, mirrored top/bottom and forward/backward turns, flat endpoints, and stiff-cover behavior. `tests/paper-surface.html` is a paused-render QA fixture: its progress slider exposes both sides and the midpoint, and Complete turn checks resource cleanup. Browser checks cover front/back texture orientation, seamless rendering at 0%, 25%, 40%, 50%, and 75%, PDF/EPUB integration, and temporary-surface cleanup.

## Corner dragging and spring release

At 100% zoom, grab a top or bottom **outer page corner**. On a spread, right corners turn forward and left corners turn back; single-page PDFs support both sides. A perspective-aware solver follows the pointer along the page edge while keeping the spine fixed and the complete page coherent. Corner hit regions adapt to page size.

Pull past 55% of the visible page width, or flick inward with enough recent momentum, to complete a corner turn. A short, slow release springs back, leaving progress and bookmarks unchanged. A strong pull back before release can cancel a turn. Both completion and cancellation use a damped spring with release velocity; the grip pose relaxes as the page settles, while the selected subtle corner curl remains until the page is flat. Middle-of-page swipes retain the existing 50-pixel threshold. When zoomed, dragging still pans. Two-finger pinch cancels a corner preview before taking over zoom. Gestures are confined to the book viewport; the rest of the app scrolls normally.

Checks: `node tests/paper-dynamics.test.cjs` covers top/bottom grips, perspective anchoring, spine stability, completion thresholds, and spring convergence at 30/60/120 Hz. `node tests/reader-pinch.test.cjs` also exercises real reader pointer handlers for short/completed corner releases, an early release while textures are preparing, and pinch takeover. Browser mouse checks cover a short top-corner return and a completed bottom-corner turn. Physical touchscreen verification remains unavailable. The paused surface fixture includes a Grip selector and Vertical pull control for inspecting page arcs.

## Corner previews and taps

At 100% zoom, hovering over an outer top or bottom corner gently lifts that corner. Clicking or tapping turns one page; moving more than eight pixels starts the existing finger-following curl. A short drag remains a drag rather than becoming a tap; it springs back when released slowly and can complete when flicked inward. Forward and backward turns mirror both the sheet curvature and the corner grip.

Hover previews do not change reading position or play sounds. They return on pointer exit and release their textures; pressing adopts the existing surface to avoid a flash. Navigation, resize, zoom, dialogs, book replacement, and pinch takeover clear the preview. Reduced-motion preferences skip the hover animation. The paused surface fixture includes Direction and Corner preview controls.

Validation includes mirrored geometry, localized hover lift, asynchronous corner taps, tap jitter, cancellation, hover ownership/cleanup, and pinch takeover. Browser checks cover the compiled WebGL shader, forward/backward corner clicks, and adopting a visible hover preview.

The whole-page arc also applies to arrow-button, keyboard, tap, and middle-of-page swipe turns. Automatic turns use the bottom outer corner; a corner press preserves the chosen top/bottom detail through completion or spring return. Hover keeps the main sheet flat and lifts only the corner margin. Leaving a hovered corner lowers that margin without rotating the full page.

## Gentle page curvature

The sheet's tangent angle follows its overall rotation with a small width-dependent offset. An analytic arc preserves material length across the printed area. A four-sample integral adds the corner detail in the outer 16% of the page; it introduces less than 0.1% length variation and 0.3% shear in that small margin. The rest of the page stays isometric. Surface normals follow the same derivatives in JavaScript and GLSL.

Geometry tests limit angular variation across the page so a U-shaped roll cannot return unnoticed. They also verify shared mesh edges, fixed binding, confined hover lift, mirrored directions, flat endpoints, covers and perspective-aware edge contact.

## Drag momentum

Corner release uses timestamped pointer samples over the most recent 100 milliseconds, including coalesced events. Velocity is measured in visible page widths per second and converted to angular progress velocity, keeping forward/backward turns and narrow mobile pages consistent. The decision combines distance with a short projected coast; tiny movements and vertical pulls do not accidentally turn a page. A pause dissipates momentum, and a deliberate last-moment reversal can cancel a turn.

Release velocity feeds the same damped spring that renders the page. Fast flicks travel and land sooner; slow drags settle gently. The grip pose relaxes as the sheet approaches its destination so the page lands flat. Motion is captured before asynchronous texture creation, and canceled gestures always return with zero release impulse.

`node tests/paper-momentum.test.cjs` checks speed/distance decisions, pauses, reversals, cancellations, mirrored corners, mobile scaling, input rates, and the actual release animation. The reader pointer tests cover short flicks in both directions, pointer-up-only movement, texture preparation delays, and held/canceled releases. The paused GPU fixture has a Release speed selector for comparing gentle and fast completions.

## Responsive one-page reading

View → Auto uses one page at widths up to 700 px, and on touch devices up to 1,000 px so phones stay in single-page mode in landscape. Larger screens use spreads. View → Single page or Two-page spread explicitly overrides the automatic choice for that book. Single-page navigation, corner curls, and momentum work for every format, including illustration plates and ending pages.

Legacy saved spread settings adapt to phones. New preferences are stored separately from the resolved layout. Logical page anchors preserve reading position and bookmarks when switching layouts; PDF anchors retain source pages and spread halves. Switching a right-hand page to a spread and back retains that page. Text reflow across different page dimensions maps to the nearest corresponding location.

`node tests/reading-layout.test.cjs` checks responsive defaults, touch landscape, explicit overrides, legacy progress, bookmarks, illustration data retention, PDF anchors, and right-page resume. Browser checks at 390 × 844 cover restored PDF pages, text navigation and bookmarks, reopening, spread overrides, and EPUB illustration/text pages.

## Mobile focus mode

Phones open in an edge-to-edge reading viewport with the header and controls hidden. Tap the middle of the screen to show or hide controls. While shown, the controls reserve their measured header and dock space; the page fits between them without covering its text or footer. Hiding controls restores the full viewport while preserving the reading location and zoom. Controls fade away after four seconds of inactivity. Pointer, keyboard, and control input restart the timer. Holding a control, opening a dialog, or navigating the controls with a keyboard keeps them available; closing a dialog starts a fresh countdown. Corner taps turn pages, while drags, pans, and PDF pinches do not toggle the controls. Upload, zoom, view selection, bookmarks, and the library remain accessible in the overlays. Safe-area insets protect controls on phones with a notch or home indicator.

Use **Exit reading mode** to return to the normal layout for this visit. Reopening on a phone starts focused again. Larger screens keep their regular layout and explicit fullscreen button. This default uses a CSS viewport; the browser's address bar remains under the browser's control. Keyboard Tab reveals the controls, Enter/Space on the viewport toggles them, and Escape hides visible controls before exiting reading mode.

`node tests/mobile-reading.test.cjs` checks mobile defaults, responsive exits, manual opt-out, unobstructed control spacing, middle taps, pan/pinch isolation, keyboard access, inactivity deadlines, timer resets, held controls, dialog suspension, and timer cleanup. Browser checks at 390 × 844 verify hidden/revealed controls, page bounds between the header and dock, page turns, library access, and restoring focused mode on reload.

## Consistent single-page turns

Swipe left to advance one page, or right to return one page. Forward turns lift the current page and immediately reveal the next page underneath. Backward turns bring the previous page in from the left over the stationary current page, unfolding it around the left binding. The current page stays visible throughout a backward drag. The moving sheet’s reverse uses neutral paper so the destination text is never duplicated or mirrored on the curling sheet. Canceling a backward turn withdraws the previous sheet to the left and retains the current page. Progress changes only once the turn lands.

Body swipes lock to their initial horizontal direction. Turning back cancels the current sheet instead of reversing navigation at release. A slow swipe needs roughly a quarter of the page width; a deliberate shorter flick can complete with momentum. Vertical gestures and tiny swipes do not turn pages. Corner grips retain their existing distance and momentum behavior. When zoomed, dragging pans instead.

`node tests/single-page-turn.test.cjs` checks mirrored directions, mobile thresholds, flicks, reversals, the correct moving sheet, stationary current-page visibility, left-side start and flat landing, cancellation cleanup, neutral reverse selection, and delayed progress commits. The reader pointer tests also exercise actual middle-swipe handlers in both directions.

The paused fixture at `tests/single-page-surface.html` labels current/adjacent pages and exposes curl progress in both directions, so the incoming previous sheet, stationary current page, next-page underlay, and neutral reverse can be inspected without racing a live animation. Mobile browser checks verify native left/right drags move 2 → 3 → 2, and no temporary sheet or underlay remains after landing.

## Incoming page finger tracking

Backward corner drags track the page edge in both axes. A constrained pose solver rotates the whole sheet while keeping the binding fixed and preserving material lengths. Pulls outside the page’s physical reach meet resistance instead of stretching the surface. Backward swipes across the page use the same incoming geometry, driven by swipe displacement.

A short release springs the leading edge back to the left while the current page and saved position remain unchanged. If GPU rendering is unavailable, the incoming page keeps its drag position and animates back to the left on cancellation. The spring carries the moving edge anchor and eases vertical pull back to rest; completing a turn keeps the existing distance/flick policy.

`node tests/incoming-drag.test.cjs` verifies perspective-correct pointer anchoring for top/bottom grips, mobile/desktop widths, paper, rigid covers, preserved material lengths and angles, reversals, velocity and actual return springs at 30/60/120 Hz. Reader pointer tests verify the grip passed to the renderer and short/completed backward corner releases. The paused single-page fixture adds a finger marker, vertical pull and Release control to inspect the real GPU curl and spring return.

## Matching forward and backward drags

Single-page forward and backward turns share the same pointer mapping, constrained pose solver, perspective projection, momentum conversion, and release spring. Both corner and body drags track horizontal and vertical input. Forward lifts the current sheet to reveal the next page; backward brings the previous sheet over the stationary current page. Short forward releases spring back right, and short backward releases spring back left. Both retain the current page and saved position when canceled.

The moving grip follows the visible page edge throughout release, with matching timing and vertical relaxation in both directions. CSS fallbacks retain the drag position, reveal the appropriate page underneath and animate back to rest if GPU preparation fails. Reduced-motion preferences remain respected.

The finger-tracking tests now verify forward/backward anchors across viewport sizes and cover stiffness, and compare mirrored spring trajectories for completion, cancellation and momentum at 30/60/120 Hz. Reader pointer tests cover forward grips, short/completed forward turns and fallback cancellation. The paused fixture’s finger marker and Release button work in both directions.

## Firmer paper material

The page uses a shallow, integrated arc across its width. Pointer input changes the whole sheet's angle rather than displacing individual vertices. This preserves the printed area without a rubber-like correction field. Unreachable input meets resistance. Covers retain a pure rigid rotation.

Release uses near-critical damping with a firmer response, removing the repeated elastic wobble. Fast flicks still land sooner; canceled turns return to the same page without changing saved progress.

The geometry tests measure local horizontal/vertical lengths and orthogonality during strong drags across screen sizes, in both directions. They also verify rigid covers, fixed binding, reachable finger contact and coherent poses under excessive input. Spring tests retain momentum checks and verify monotone landing without repeated oscillation. Browser checks cover both directions, short returns, completed turns, text legibility and temporary surface cleanup.

## Paper edges, curl shadows and texture handoff

The turning mesh has a continuous sidewall around its perimeter (0.7 CSS pixels for paper, 1.35 for covers). A warm rim highlight and grazing-angle shading make the curled edge readable without changing the paper geometry. A coarse projected caster follows the actual page pose, with five low-opacity samples for a height-dependent soft shadow. Shadows fade to zero when the page lies flat. The previous generic oval shadow is removed. Extra GPU buffers are released after each turn.

The resting page now displays the same artwork that WebGL samples during the curl. The browser rasterizes a flattened, computed-style copy through SVG foreignObject, preserving text shaping, kerning, line breaks, borders, illustrations and overlays. Canvas pixels and local image blobs are embedded before rasterizing. Engines that restrict foreignObject readback use the existing canvas painter, shared at rest and in motion as well. Original page content remains accessible beneath the visual layer.

A bounded eight-page cache deduplicates concurrent requests, invalidates on content, dimensions or display-resolution changes, and drops detached books and distant pages. PDF artwork waits for its source render to finish; PDF source quality also includes high-DPI/perspective headroom. Turn disposal releases GPU resources while preserving the resting artwork. There is no settling crossfade or switch to a separately typeset page. The previous 2px Z offset on the animation canvas is also removed to keep the flat endpoint on the resting page's pixel grid.

`node --test tests/*.test.cjs` runs the regression suites. `page-artwork.test.cjs` covers resolution budgets, shared preparation, content invalidation, stale cleanup and PDF readiness. Depth tests verify physical rims, resource disposal, preserved shared pixels and immediate reveal without a fade. Browser checks cover both directions and flat endpoint alignment: an interior screenshot comparison measured a mean channel difference of 0.385/255 between the GPU endpoint and the resting artwork.

## Whole-page arc and release verification

The previous crease-and-roll model has been removed. The complete sheet rotates through a gentle arc; it does not reflect back around a moving curl band. A small outer-margin detail identifies the grabbed corner. Release begins at the angle actually rendered under the finger, preventing a snap or recoil when input progress and the constrained pose differ.

`tests/spread-reading-surface.html` supports paused stages and complete replays from top/bottom corners in both directions. `spread-curl.test.cjs` checks the full-page arc, limited tangent variation, localized hover detail and continuous landings. `incoming-drag.test.cjs` feeds the actual arc solver into release at 30/60/120 Hz and checks that the visible page never recoils or jumps. The existing reading-order, PDF, bookmarks, pinch, momentum and GPU cleanup tests remain in place.

## Reading controls and visual polish

The reader groups zoom, layout selection and fullscreen in one compact toolbar. An opened book removes the welcome heading, and a separate dock groups book details, progress, bookmarks and the local library. The library dialog includes a Bookmarks section, readable book cards and empty-state actions. Sound and evening-theme choices are saved separately from book progress, with safe defaults when browser storage is unavailable.

Mobile controls reserve space while visible and return that space to the page after inactivity. Narrow phones use compact controls; short desktop windows fit the book above the dock. Browser modifier shortcuts, composition and editable fields do not trigger page navigation. `tests/mobile-reading.test.cjs` checks these control and preference behaviors alongside the mobile focus lifecycle.

Fullscreen expands the reading viewport immediately while requesting browser fullscreen. Embedded browsers that leave a native request pending still get a usable reading mode. The control tests cover this fallback and native Escape cleanup. `library-controls.test.cjs` verifies that late IndexedDB reads cannot replace a newly selected section or a closed dialog.

Desktop reading now fills the height left by compact controls instead of using a capped scene or a 100% base-page limit. Wide desktops use a single-row dock; narrower windows and PDF layout tools retain wrapped rows. The page scales to the limiting width or height, while zoom remains relative to Fit. `reader-fit.test.cjs` covers desktop enlargement, constrained windows, mobile fitting and bounded panning.

PDF artwork uses a direct, synchronous copy of the completed PDF.js canvas, contained within the page borders. It bypasses foreignObject serialization to avoid blank or clipped cached images. Source replacements invalidate old artwork and restore source visibility; failed renders keep their error message visible. `pdf-artwork.test.cjs` checks complete portrait/landscape/split images, aspect ratio, resolution and missing-pixel rejection.

Spread rendering hides inactive faces so their co-planar canvases cannot bleed through the current PDF. During a turn, only the two stationary backgrounds are retained; reference-counted ownership prevents an outgoing corner preview from hiding a newer turn background. GPU and CSS fallback turns, drags and canceled drags release these layers at landing. `spread-layers.test.cjs` checks forward/backward backgrounds, overlapping ownership, idempotent cleanup and cover boundaries.

Mobile PDF verification at 390 × 844 and 320 × 640 uses the same reviewer PDF in an isolated local preview. Forward and backward swipes return 23 → 24 → 23; short swipes retain the page. The complete page, including its footer, stays between revealed controls. Auto-hide restores the full reading area. `mobile-controls-space.test.cjs` checks measured and wrapped rows, short screens and container-relative insets. Idle timers defer hiding during turns and pinches.

## Turn responsiveness

Tap and button turns last 480 ms. Drag release keeps the initial pull gentle, then progressively firms the damped spring to remove the slow landing tail. The reader accepts the next gesture after the page lands and its temporary surface is cleaned up. At 60 Hz the deterministic release check measures about 467 ms for a gentle release and 350 ms for a flick from 30% progress. Forward/backward completions and spring-backs are checked at 30/60/120 Hz; physical phone frame rates can vary.

## Opening-page artwork as cover

PDFs with an embedded image on their first source page use that complete page as the front cover, preserving its printed title, image composition and aspect ratio. Text-only opening pages keep the Leafroom cover. EPUBs keep their designated cover, or use the first reading page when it is an illustration. The original reading pages remain in place, preserving bookmarks and progress. Covers are regenerated from the saved local file when reopening, and reuse the sharp artwork pipeline during flips.

Verification: `node tests/book-cover.test.cjs` covers image-paint detection, text-only fallback, damaged-image detection, split PDF layouts, EPUB cover precedence and unchanged reading pages. `tests/fixtures/image-cover.pdf` supplies an embedded-image cover for browser checks. Desktop and 390-pixel mobile checks cover opening, forward/backward turns and reopening.

## PDF page proportions

The book uses the most common logical PDF page aspect ratio, accounting for split spreads. The shape stays fixed during page turns and adapts to the responsive page height. PDF canvases fit inside a thin border without the added cream side strips; mixed-size inserts remain contained on white paper without cropping or stretching. Switching back to text/EPUB restores the standard sheet proportions. The original reviewer PDF was checked on desktop and at 390×844, including forward/backward turns, with no temporary turn surfaces left at rest.

## Firebase Hosting

Prepare the public app folder with:

```sh
node scripts/build-hosting.cjs
```

The build includes the ten application HTML, CSS and JavaScript files plus four Leafroom icon assets. Book files, development screenshots, test fixtures, credentials and environment files are excluded. Firebase Hosting serves the generated `hosting-public/` directory using `firebase.json`.

Future deployments use Firebase CLI **inside Cloud Build**, authenticated with an attached service account. See [the keyless deployment instructions](docs/keyless-deployments.md). The project ID is supplied at command time:

```sh
node scripts/deploy-cloud.cjs --project <project-id> --firebase-tools <firebase-tools-package-directory>
```

No Firebase API keys, environment files or project alias file are required for this static hosting version. The local library remains browser-only; reviewer login and protected attached-book delivery are separate future work.

The initial Firebase releases were published using the Hosting REST API and a one-time OAuth session held in memory. The new launcher uses the Cloud Build API to submit a job; the job runs the standard `firebase deploy --only hosting` command. It does not upload Hosting releases through a custom REST deployer. Cloud activation requires billing, APIs and the deployer IAM roles described in the instructions.
