/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";

import { Angle, Vec2 } from "../../src/base/math";
import { LibText } from "../../src/kicad/text";

/**
 * "HHi" at (4, 3) in a symbol library (y up), 5 mm with a 0.5 mm pen,
 * left/top justified unless told otherwise.
 */
function make_text(
    angle = 0,
    h_align: "left" | "center" | "right" = "left",
    v_align: "top" | "center" | "bottom" = "top",
) {
    const text = new LibText("HHi");
    text.text_pos = new Vec2(40000, 30000);
    text.attributes.size = new Vec2(50000, 50000);
    text.attributes.stroke_width = 5000;
    text.attributes.angle = Angle.from_degrees(angle);
    text.attributes.h_align = h_align;
    text.attributes.v_align = v_align;
    return text;
}

function state(text: LibText) {
    return [
        text.text_angle.degrees,
        `${text.h_align} ${text.v_align}`,
        Math.round(text.text_pos.x),
        Math.round(text.text_pos.y),
    ];
}

suite("text.lib_text.LibText()", function () {
    // kicad-cli 9 draws symbol text at its anchor as placed by the symbol,
    // at 0 or 90 degrees, with the justification these steps give.

    test(".rotate()", function () {
        // A quarter turn keeps the justification going to 90 degrees and
        // flips only the horizontal one coming back to 0, as text on symbols
        // at 90, 180 and 270 degrees shows.
        const text = make_text(0, "left", "bottom");
        const center = new Vec2(0, 0);

        text.rotate(center, true);
        assert.deepEqual(state(text), [90, "left bottom", -30000, 40000]);
        text.rotate(center, true);
        assert.deepEqual(state(text), [0, "right bottom", -40000, -30000]);
        text.rotate(center, true);
        assert.deepEqual(state(text), [90, "right bottom", 30000, -40000]);
        text.rotate(center, true);
        assert.deepEqual(state(text), [0, "left bottom", 40000, 30000]);

        text.rotate(center);
        assert.deepEqual(state(text), [90, "right bottom", 30000, -40000]);
    });

    test(".mirror_horizontally()", function () {
        const text = make_text(0, "left", "bottom");
        text.mirror_horizontally(new Vec2(0, 0));
        assert.deepEqual(state(text), [0, "right bottom", -40000, 30000]);

        const vertical = make_text(90, "left", "bottom");
        vertical.mirror_horizontally(new Vec2(0, 0));
        assert.deepEqual(state(vertical), [90, "left top", -40000, 30000]);
    });

    test(".mirror_vertically()", function () {
        const text = make_text(0, "left", "bottom");
        text.mirror_vertically(new Vec2(0, 0));
        assert.deepEqual(state(text), [0, "left top", 40000, -30000]);

        const vertical = make_text(90, "left", "bottom");
        vertical.mirror_vertically(new Vec2(0, 0));
        assert.deepEqual(state(vertical), [90, "right bottom", 40000, -30000]);
    });

    test(".apply_symbol_transformations()", function () {
        // Symbol at (50, 50) mm.
        const place = (
            text: LibText,
            rotations: number,
            mirror_x = false,
            mirror_y = false,
        ) => {
            text.apply_symbol_transformations({
                position: new Vec2(50, 50),
                rotations,
                mirror_x,
                mirror_y,
            });
            return state(text);
        };

        assert.deepEqual(place(make_text(), 0), [
            0,
            "left top",
            540000,
            470000,
        ]);
        assert.deepEqual(place(make_text(), 2), [
            0,
            "right top",
            460000,
            530000,
        ]);
        assert.deepEqual(place(make_text(), 0, true), [
            0,
            "left bottom",
            540000,
            530000,
        ]);
        assert.deepEqual(place(make_text(), 1, false, true), [
            90,
            "left top",
            530000,
            460000,
        ]);
        assert.deepEqual(place(make_text(), 1, true), [
            90,
            "right top",
            470000,
            540000,
        ]);
        // (180, mirror x) is (0, mirror y); (270, mirror x) is (90, mirror y).
        assert.deepEqual(
            place(make_text(), 2, true),
            place(make_text(), 0, false, true),
        );
        assert.deepEqual(
            place(make_text(90), 3, true),
            place(make_text(90), 1, false, true),
        );
        assert.deepEqual(place(make_text(90), 1, true), [
            0,
            "right bottom",
            470000,
            540000,
        ]);
    });

    test(".world_pos", function () {
        // Drawn centred instead of top-justified, the anchor moves 2.925 mm
        // (0.585 of the height) down the glyphs.
        const text = make_text();
        text.apply_symbol_transformations({
            position: new Vec2(50, 50),
            rotations: 2,
            mirror_x: false,
            mirror_y: false,
        });
        assert.closeTo(text.world_pos.x, 460000, 1e-6);
        assert.closeTo(text.world_pos.y, 530000 + 29250, 1e-6);

        const vertical = make_text(90, "left", "bottom");
        vertical.apply_symbol_transformations({
            position: new Vec2(50, 50),
            rotations: 0,
            mirror_x: false,
            mirror_y: false,
        });
        assert.closeTo(vertical.world_pos.x, 540000 - 29250, 1e-6);
        assert.closeTo(vertical.world_pos.y, 470000, 1e-6);
    });

    test(".bounding_box", function () {
        // The text box (see EDAText) laid by the effective justification.
        const text = make_text();
        text.apply_symbol_transformations({
            position: new Vec2(50, 50),
            rotations: 2,
            mirror_x: false,
            mirror_y: false,
        });
        const box = text.bounding_box;
        assert.closeTo(box.x / 10000, 46 - 13.3571, 0.0002);
        assert.closeTo(box.y / 10000, 53, 0.0002);
        assert.closeTo(box.w / 10000, 13.3571, 0.0002);
        assert.closeTo(box.h / 10000, 5.395, 0.0002);
    });
});
