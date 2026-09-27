/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * The fonts KiCanvas's UI uses, bundled into kicanvas.js so it works offline
 * and makes no third-party requests (upstream linked Google Fonts at runtime).
 *
 * They're registered through the FontFace API from bytes, so a page's
 * Content-Security-Policy needs neither an inline <style> nor data: fonts.
 *
 * Sources (third_party/fonts, licences alongside):
 * - Nunito, latin subset, variable weight 300..700 (SIL OFL 1.1), from
 *   https://fonts.googleapis.com/css2?family=Nunito:wght@300..700
 * - Material Symbols Outlined (Apache 2.0), subset to the icons KiCanvas
 *   names, from https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,400,0,0&icon_names=category,check,close,download,flip,folder,help,hub,info,interests,layers,list,memory,question_mark,search,settings,visibility,visibility_off
 *   A new icon ligature needs its name added there and the subset refetched.
 */

import material_symbols from "../../../third_party/fonts/material-symbols-outlined-subset.woff2";
import nunito from "../../../third_party/fonts/nunito-latin.woff2";

const faces = [
    new FontFace("Material Symbols Outlined", material_symbols, {
        style: "normal",
        weight: "400",
        display: "block",
    }),
    new FontFace("Nunito", nunito, {
        style: "normal",
        weight: "300 700",
        display: "swap",
        unicodeRange:
            "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    }),
];

for (const face of faces) {
    document.fonts.add(face);
}
