/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";

import { Vec2 } from "../../src/base/math";
import { EDAText } from "../../src/kicad/text";

function text(
    value: string,
    size: [number, number],
    pen = 0,
    setup: (t: EDAText) => void = () => {},
) {
    const t = new EDAText(value);
    t.attributes.size = new Vec2(size[0] * 10000, size[1] * 10000);
    t.attributes.stroke_width = pen * 10000;
    t.attributes.h_align = "left";
    t.attributes.v_align = "top";
    setup(t);
    return t;
}

function assert_box(t: EDAText, x: number, y: number, w: number, h: number) {
    const box = t.get_text_box();
    assert.closeTo(box.x / 10000, x, 0.0002);
    assert.closeTo(box.y / 10000, y, 0.0002);
    assert.closeTo(box.w / 10000, w, 0.0002);
    assert.closeTo(box.h / 10000, h, 0.0002);
}

suite("text.EDAText()", function () {
    test(".get_effective_text_thickness()", function () {
        // Pens kicad-cli 9 draws schematic text with.
        const pen = (t: EDAText, fallback?: number) =>
            t.get_effective_text_thickness(fallback) / 10000;

        // Bold without a thickness: a fifth of the width, at most a quarter
        // of the smaller dimension.
        const bold = (t: EDAText) => (t.attributes.bold = true);
        assert.closeTo(pen(text("H", [1.27, 1.27], 0, bold)), 0.254, 1e-9);
        assert.closeTo(pen(text("H", [1, 3], 0, bold)), 0.2, 1e-9);
        assert.closeTo(pen(text("H", [3, 1], 0, bold)), 0.25, 1e-9);

        // A given thickness is clamped the same way.
        assert.closeTo(pen(text("H", [1.27, 1.27], 0.5)), 0.3175, 1e-9);
        assert.closeTo(pen(text("H", [1.27, 1.27], 0.3)), 0.3, 1e-9);

        // Otherwise the default (the schematic line width, clamped on small
        // text), or an eighth of the width, which sizes text boxes.
        assert.closeTo(pen(text("H", [2.54, 2.54]), 1524), 0.1524, 1e-9);
        assert.closeTo(pen(text("H", [0.5, 0.5]), 1524), 0.125, 1e-9);
        assert.closeTo(pen(text("H", [2, 2])), 0.25, 1e-9);
    });

    test(".get_text_box()", function () {
        // Boxes from where kicad-cli 9 centres schematic fields of this text:
        // "HHi" is 54 font units of advance.
        assert_box(text("HHi", [5, 5], 0.5), 0, 0, 13.3571, 5.395);
        assert_box(
            text("HHi", [5, 5], 0.5, (t) => {
                t.h_align = "right";
                t.v_align = "bottom";
            }),
            -13.3571,
            -5.395,
            13.3571,
            5.395,
        );
        assert_box(
            text("HHi", [5, 5], 0.5, (t) => {
                t.h_align = "center";
                t.v_align = "center";
                t.text_pos = new Vec2(100000, 200000);
            }),
            10 - 13.3571 / 2,
            20 - 5.395 / 2,
            13.3571,
            5.395,
        );

        // Sized with an eighth of the width when there's no thickness.
        assert_box(text("HHi", [10, 10]), 0, 0, 27.4642, 11.4124);

        // A trailing subscript takes off 0.2 of its own, smaller, width.
        assert_box(text("H_{Hi}", [5, 5], 0.5), 0, 0, 12.0334, 5.395);

        // Overbars and extra lines add height.
        assert_box(text("~{HHi}", [5, 5], 0.1), 0, 0, 12.1572, 5.2822);
        assert_box(text("H\nH", [5, 5], 0.5), 0, 0, 5.738, 13.4446);
        assert_box(text("~{H}\nH", [5, 5], 0.5), 0, 0, 5.738, 14.528);
    });
});
