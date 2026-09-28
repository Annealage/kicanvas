# Newstroke font

The Newstroke font is a Hershey font and is the primary font used in KiCad. It is licensed under [Creative Commons' CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

This source distribution was retrieved from https://vovanium.ru/sledy/newstroke/en on Friday, January 20th, 2023.

In February 2023 the files were updated from the copy of these sources KiCad keeps, which adds the CJK libraries (`CJK_symbol.lib`, `hiragana.lib`, `katakana.lib`, `half_full.lib`, `CKJ_wide.lib`) to the author's. The ideographs in `CKJ_wide.lib` are Lingdong Huang's [chinese-hershey-font](https://github.com/LingDong-/chinese-hershey-font) conversion (MIT License) of Adobe's [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) (SIL Open Font License 1.1).

`scripts/build-font.js` generates `src/kicad/text/newstroke-glyphs.ts` from these files.
