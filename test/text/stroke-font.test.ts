/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { AssertionError, assert } from "chai";

import { Angle, Vec2 } from "../../src/base/math";
import { Polyline } from "../../src/graphics";
import { NullRenderer } from "../../src/graphics/null-renderer";
import {
    StrokeFont,
    StrokeGlyph,
    TextAttributes,
    TextStyle,
} from "../../src/kicad/text";

const font = StrokeFont.default();

// Expected values are kicad-cli 9 `pcb export svg` output for gr_text 21 mm
// tall and wide with a 1 mm pen (so one font unit is 1 mm), relative to the
// text's (at ...). The SVG has 4 decimals.
const SIZE = new Vec2(210000, 210000);
const PEN = 10000;

function draw(
    text: string,
    setup: (a: TextAttributes) => void = () => {},
): [number, number][][] {
    const attributes = new TextAttributes();
    attributes.size = SIZE;
    attributes.stroke_width = PEN;
    attributes.h_align = "left";
    attributes.v_align = "bottom";
    setup(attributes);

    const gfx = new NullRenderer();
    gfx.start_layer("test");
    font.draw(gfx, text, new Vec2(0, 0), attributes);
    return gfx
        .end_layer()
        .shapes.map((s) => (s as Polyline).points.map((p) => [p.x, p.y]));
}

function assert_strokes(
    actual: [number, number][][],
    expected: [number, number][][],
    delta = 0.0002,
) {
    assert.equal(actual.length, expected.length, "stroke count");
    actual.forEach((stroke, i) => {
        assert.equal(stroke.length, expected[i]!.length, `stroke ${i} length`);
        stroke.forEach(([x, y], j) => {
            const [ex, ey] = expected[i]![j]!;
            if (Math.abs(x - ex) > delta || Math.abs(y - ey) > delta) {
                throw new AssertionError(
                    `stroke ${i} point ${j}: (${x}, ${y}) != (${ex}, ${ey})`,
                );
            }
        });
    });
}

// "H" drawn left/bottom-justified.
const H_LEFT_BOTTOM: [number, number][][] = [
    [
        [5.6579, -2.622],
        [5.6579, -23.622],
    ],
    [
        [5.6579, -13.622],
        [17.6579, -13.622],
    ],
    [
        [17.6579, -2.622],
        [17.6579, -23.622],
    ],
];

suite("text.stroke_font.StrokeFont()", function () {
    test(".get_glyph()", function () {
        // Advance widths and strokes in em units (21 font units), x from the
        // start of the advance box and y from the baseline. kicad-cli draws
        // "H" 22 units wide with stems 5 units in and a crossbar 11 units up,
        // and a space 16 units wide.
        const space = font.get_glyph(" ");
        assert.equal(space.strokes.length, 0);
        assert.closeTo(space.bbox.w, 16 / 21, 1e-12);

        const h = font.get_glyph("H");
        assert.closeTo(h.bbox.w, 22 / 21, 1e-12);
        assert.deepEqual(
            h.strokes.map((s) => s.map((p) => [p.x * 21, p.y * 21])),
            [
                [
                    [5, 0],
                    [5, -21],
                ],
                [
                    [5, -11],
                    [17, -11],
                ],
                [
                    [17, 0],
                    [17, -21],
                ],
            ],
        );

        // KiCad draws the tilde mid-height, 8 to 10 units up.
        const tilde = font.get_glyph("~");
        const ys = tilde.strokes.flat().map((p) => p.y * 21);
        assert.equal(Math.min(...ys), -10);
        assert.equal(Math.max(...ys), -8);
    });

    test(".get_interline()", function () {
        // Ten lines of "H" 100 mm tall span 1448.9496 mm of baselines.
        assert.closeTo(font.get_interline(1000000), 1609944, 1);
        assert.closeTo(font.get_interline(210000, 1), 338088, 1);
    });

    test(".compute_overbar_vertical_position()", function () {
        // "~{H}" at 21 mm: the bar is 26.83 mm above the baseline.
        assert.closeTo(
            font.compute_overbar_vertical_position(210000),
            268300,
            1,
        );
    });

    test(".get_text_as_glyphs()", function () {
        const { bbox, glyphs, cursor } = font.get_text_as_glyphs(
            "HH",
            SIZE,
            new Vec2(10000, 20000),
            new Angle(0),
            false,
            new Vec2(0, 0),
            new TextStyle(),
        );

        // Advances add up, 22 units each.
        assert.equal(glyphs.length, 2);
        assert.closeTo(cursor.x, 10000 + 440000, 1e-6);
        assert.closeTo(cursor.y, 20000, 1e-6);
        assert.closeTo(bbox.x, 10000, 1e-6);
        assert.closeTo(bbox.w, 440000, 1e-6);
        assert.closeTo(bbox.h, 210000, 1e-6);

        // Subscripts are 0.8 size, 2.32 mm lower; superscripts 6.08 mm higher.
        const sub = font.get_text_as_glyphs(
            "H",
            SIZE,
            new Vec2(0, 0),
            new Angle(0),
            false,
            new Vec2(0, 0),
            new TextStyle(false, false, true, false),
        );
        assert.closeTo(sub.cursor.x, 176000, 1e-6);
        const stem = (sub.glyphs[0] as StrokeGlyph).strokes[0]!;
        assert.closeTo(stem[0]!.x, 40000, 1e-6);
        assert.closeTo(stem[0]!.y, 23200, 1e-6);
        assert.closeTo(stem[1]!.y, 23200 - 168000, 1e-6);

        const sup = font.get_text_as_glyphs(
            "H",
            SIZE,
            new Vec2(0, 0),
            new Angle(0),
            false,
            new Vec2(0, 0),
            new TextStyle(false, false, false, true),
        );
        assert.closeTo(
            (sup.glyphs[0] as StrokeGlyph).strokes[0]![0]!.y,
            -60800,
            1e-6,
        );
    });

    test(".get_line_extents()", function () {
        // "hello world" at 2 mm: 178 font units of advance. A kicad-cli
        // text box fits it on one line exactly when its column is this wide.
        const size = new Vec2(20000, 20000);
        const advance = (178 * 20000) / 21;
        assert.closeTo(
            font.get_line_extents("hello world", size, 0, false, false).x,
            advance,
            1e-6,
        );
        assert.closeTo(
            font.get_line_extents("hello world", size, 2000, false, true).x,
            advance + 2000,
            1e-6,
        );
        // A subscript advances at 0.8 size.
        assert.closeTo(
            font.get_line_extents("H_{H}", SIZE, 0, false, false).x,
            ((22 + 22 * 0.8) * 210000) / 21,
            1e-6,
        );
    });

    test(".draw() justification", function () {
        assert_strokes(draw("H"), H_LEFT_BOTTOM);

        // Left and right justification keep 0.6579 pens from the anchor,
        // centred text none; top/centre/bottom move the baseline.
        assert_strokes(
            draw("H", (a) => {
                a.h_align = "right";
                a.v_align = "top";
            }),
            [
                [
                    [-17.6579, 21.948],
                    [-17.6579, 0.948],
                ],
                [
                    [-17.6579, 10.948],
                    [-5.6579, 10.948],
                ],
                [
                    [-5.6579, 21.948],
                    [-5.6579, 0.948],
                ],
            ],
        );
        assert_strokes(
            draw("H", (a) => {
                a.h_align = "center";
                a.v_align = "center";
            }),
            [
                [
                    [-6, 9.663],
                    [-6, -11.337],
                ],
                [
                    [-6, -1.337],
                    [6, -1.337],
                ],
                [
                    [6, 9.663],
                    [6, -11.337],
                ],
            ],
        );

        // The margin and baseline follow the pen: a 3 mm pen.
        assert_strokes(
            draw("H", (a) => (a.stroke_width = 30000)),
            [
                [
                    [6.9737, -2.726],
                    [6.9737, -23.726],
                ],
                [
                    [6.9737, -13.726],
                    [18.9737, -13.726],
                ],
                [
                    [18.9737, -2.726],
                    [18.9737, -23.726],
                ],
            ],
        );
    });

    test(".draw() italic, rotated and mirrored", function () {
        assert_strokes(
            draw("H", (a) => (a.italic = true)),
            [
                [
                    [5.5329, -2.622],
                    [8.1579, -23.622],
                ],
                [
                    [6.9079, -13.622],
                    [18.9079, -13.622],
                ],
                [
                    [17.5329, -2.622],
                    [20.1579, -23.622],
                ],
            ],
        );
        assert_strokes(
            draw("H", (a) => (a.angle = Angle.from_degrees(90))),
            [
                [
                    [-2.622, -5.6579],
                    [-23.622, -5.6579],
                ],
                [
                    [-13.622, -5.6579],
                    [-13.622, -17.6579],
                ],
                [
                    [-2.622, -17.6579],
                    [-23.622, -17.6579],
                ],
            ],
        );
        assert_strokes(
            draw("H", (a) => (a.angle = Angle.from_degrees(30))),
            [
                [
                    [3.5889, -5.0997],
                    [-6.9111, -23.2862],
                ],
                [
                    [-1.9111, -14.6259],
                    [8.4812, -20.6259],
                ],
                [
                    [13.9812, -11.0997],
                    [3.4812, -29.2862],
                ],
            ],
        );
        assert_strokes(
            draw("H", (a) => (a.mirrored = true)),
            H_LEFT_BOTTOM.map((s) => s.map(([x, y]) => [-x, y])),
        );
    });

    test(".draw() markup", function () {
        // "H~{H}H": the bar spans the middle H's advance less 2.1 mm (0.1
        // of the width) at each end, 26.83 mm above the baseline.
        const strokes = draw("H~{H}H");
        const bars = strokes.filter((s) => s[0]![1] < -29);
        assert_strokes(bars, [
            [
                [24.7579, -29.452],
                [42.5579, -29.452],
            ],
        ]);

        // "H_{H}" and "H^{H}": the second H at 0.8 size, 4 mm in.
        assert_strokes(draw("H_{H}").slice(3), [
            [
                [26.6579, -0.302],
                [26.6579, -17.102],
            ],
            [
                [26.6579, -9.102],
                [36.2579, -9.102],
            ],
            [
                [36.2579, -0.302],
                [36.2579, -17.102],
            ],
        ]);
        assert_strokes(draw("H^{H}").slice(3, 4), [
            [
                [26.6579, -8.702],
                [26.6579, -25.502],
            ],
        ]);

        // A subscript anywhere in the nesting wins.
        assert_strokes(draw("H^{H_{H}}").slice(6, 7), [
            [
                [44.2579, -0.302],
                [44.2579, -17.102],
            ],
        ]);

        // Unclosed markup is drawn as typed; empty markup draws nothing.
        assert.equal(draw("~{H").length, draw("~").length + draw("{H").length);
        assert.equal(draw("H~{}").length, 3);
    });

    test(".draw() tabs", function () {
        // Tab stops at 79 + 84k font units from the start of the run.
        const left_stem = (text: string) =>
            Math.max(
                ...draw(text)
                    .flat()
                    .map(([x]) => x),
            ) - 12;
        assert.closeTo(left_stem("H\tH"), 84.6579, 0.0002);
        assert.closeTo(left_stem("HHH\tH"), 84.6579, 0.0002);
        assert.closeTo(left_stem("HHHH\tH"), 168.6579, 0.0002);
        assert.closeTo(left_stem("mmm\tH"), 168.6579, 0.0002);
        assert.closeTo(left_stem("H\t\tH"), 168.6579, 0.0002);
        assert.closeTo(left_stem("H^{H}\tH"), 124.2579, 0.0002);
    });

    test(".draw() multiline", function () {
        // Baselines 33.8088 mm apart; a bottom anchor holds the last line,
        // a centre anchor the middle of the block. Measured with a 2 mm pen.
        const baselines = (v_align: "top" | "center" | "bottom") =>
            draw("H\nH\nH", (a) => {
                a.v_align = v_align;
                a.stroke_width = 20000;
            })
                .filter((_, i) => i % 3 == 0)
                .map((s) => s[0]![1]);

        const expect = (actual: number[], expected: number[]) =>
            actual.forEach((y, i) => assert.closeTo(y, expected[i]!, 0.0002));

        expect(baselines("bottom"), [-70.2916, -36.4828, -2.674]);
        expect(baselines("center"), [-24.1978, 9.611, 43.4198]);
        expect(baselines("top"), [21.896, 55.7048, 89.5136]);
    });
});
