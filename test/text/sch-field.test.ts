/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";

import { Angle, Matrix3, Vec2 } from "../../src/base/math";
import { SchField } from "../../src/kicad/text";

/** Library (y up) to sheet offsets for a symbol turned `r` quarter turns counter-clockwise, then mirrored. */
function symbol_matrix(r: number, mirror?: "x" | "y") {
    const cos = [1, 0, -1, 0][r]!;
    const sin = [0, 1, 0, -1][r]!;
    const sx = mirror == "y" ? -1 : 1;
    const sy = mirror == "x" ? -1 : 1;
    // prettier-ignore
    return new Matrix3([
        sx * cos, -sy * sin, 0,
        -sx * sin, -sy * cos, 0,
        0, 0, 1,
    ]);
}

const SYMBOL = new Vec2(500000, 500000);

/**
 * "HHi", 5 mm with a 0.5 mm pen, whose sheet position is 10 mm right of and
 * 6 mm below its symbol, set up the way the schematic painter does.
 */
function field(
    rotations: number,
    mirror: "x" | "y" | undefined,
    angle: number,
    h_align: "left" | "center" | "right",
    v_align: "top" | "center" | "bottom",
) {
    const transform = symbol_matrix(rotations, mirror);
    const f = new SchField("HHi", {
        position: SYMBOL,
        transform,
        is_symbol: true,
    });
    f.attributes.size = new Vec2(50000, 50000);
    f.attributes.stroke_width = 5000;
    f.attributes.angle = Angle.from_degrees(angle);
    f.attributes.h_align = h_align;
    f.attributes.v_align = v_align;
    f.text_pos = transform
        .inverse()
        .transform(new Vec2(100000, 60000))
        .add(SYMBOL);
    return f;
}

suite("text.sch_field.SchField()", function () {
    test(".shown_text", function () {
        const f = new SchField("abc");
        assert.equal(f.shown_text, "abc");
        f.text = "~";
        assert.equal(f.shown_text, "");
    });

    test(".position", function () {
        const f = field(1, "x", 0, "left", "top");
        assert.closeTo(f.position.x, 600000, 1e-6);
        assert.closeTo(f.position.y, 560000, 1e-6);

        const orphan = new SchField("abc");
        orphan.text_pos = new Vec2(1, 2);
        assert.equal(orphan.position, orphan.text_pos);
    });

    test(".draw_rotation", function () {
        // kicad-cli 9 draws fields horizontally or vertically, turning with
        // the symbol but not with its mirroring.
        assert.equal(
            field(0, undefined, 0, "left", "top").draw_rotation.degrees,
            0,
        );
        assert.equal(
            field(0, undefined, 90, "left", "top").draw_rotation.degrees,
            90,
        );
        assert.equal(
            field(1, undefined, 0, "left", "top").draw_rotation.degrees,
            90,
        );
        assert.equal(field(1, "y", 90, "left", "top").draw_rotation.degrees, 0);
        assert.equal(field(2, "x", 0, "left", "top").draw_rotation.degrees, 0);
    });

    test(".bounding_box", function () {
        // Where kicad-cli 9 centres the text, relative to the field's sheet
        // position: the box is 13.3571 by 5.395 mm (see EDAText).
        const centre = (f: SchField) => {
            const c = f.bounding_box.center;
            return [(c.x - 600000) / 10000, (c.y - 560000) / 10000];
        };
        const expect = (actual: number[], x: number, y: number) => {
            assert.closeTo(actual[0]!, x, 0.0002);
            assert.closeTo(actual[1]!, y, 0.0002);
        };

        expect(centre(field(0, undefined, 0, "left", "top")), 6.6786, 2.6975);
        expect(
            centre(field(0, undefined, 0, "right", "bottom")),
            -6.6786,
            -2.6975,
        );
        expect(centre(field(0, undefined, 90, "left", "top")), 2.6975, -6.6786);
        expect(centre(field(1, undefined, 0, "left", "top")), 2.6975, -6.6786);
        expect(centre(field(2, undefined, 0, "left", "top")), -6.6786, -2.6975);
        expect(centre(field(0, "x", 0, "left", "top")), 6.6786, -2.6975);
        expect(centre(field(0, "y", 0, "left", "top")), -6.6786, 2.6975);
        expect(centre(field(1, "x", 90, "right", "bottom")), 6.6786, -2.6975);

        const box = field(0, undefined, 0, "center", "center").bounding_box;
        assert.closeTo(box.w / 10000, 13.3571, 0.0002);
        assert.closeTo(box.h / 10000, 5.395, 0.0002);
    });
});
