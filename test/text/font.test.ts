/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";

import { Vec2 } from "../../src/base/math";
import { StrokeFont } from "../../src/kicad/text";

// Note: using StrokeFont as a concrete class to test base class methods.
const font = StrokeFont.default();

suite("text.font.Font()", function () {
    test(".break_lines()", function () {
        // kicad-cli 9 wrapping this in schematic text boxes of 2 mm text with
        // a 0.2 mm pen, for columns (box width less margins) of each width.
        const text = "hello world ^{1} 2 3 abc ~{defg} xyz";
        const size = new Vec2(20000, 20000);
        const expected: [number, string[]][] = [
            [8, ["hello", "world", "^{1} 2", "3", "abc", "~{defg}", "xyz"]],
            [13, ["hello", "world ^{1}", "2 3 abc", "~{defg} xyz"]],
            [18, ["hello world", "^{1} 2 3 abc", "~{defg} xyz"]],
            [23, ["hello world ^{1}", "2 3 abc ~{defg}", "xyz"]],
            [28, ["hello world ^{1} 2 3", "abc ~{defg} xyz"]],
            [38, ["hello world ^{1} 2 3 abc", "~{defg} xyz"]],
            [58, [text]],
        ];
        for (const [column, lines] of expected) {
            assert.deepEqual(
                font
                    .break_lines(text, column * 10000, size, 2000, false, false)
                    .split("\n"),
                lines,
                `column ${column} mm`,
            );
        }
    });

    test(".break_lines() fit", function () {
        // A line fits once the column reaches its advance plus the pen:
        // kicad-cli keeps "hello world" (16.95238 mm of advance at 2 mm) on
        // one line in a 17.1524 mm column, and wraps it in 17.1324 mm.
        const size = new Vec2(20000, 20000);
        const advance = (178 * 20000) / 21;
        assert.equal(
            font.break_lines(
                "hello world",
                advance + 2000.19,
                size,
                2000,
                false,
                false,
            ),
            "hello world",
        );
        assert.equal(
            font.break_lines(
                "hello world",
                advance + 1800.19,
                size,
                2000,
                false,
                false,
            ),
            "hello\nworld",
        );
    });

    test(".break_lines() words", function () {
        const size = new Vec2(20000, 20000);
        const wrap = (text: string, column: number) =>
            font.break_lines(text, column * 10000, size, 2000, false, false);

        // Markup is never broken, a long word overflows on its own line,
        // runs of spaces make empty lines and line breaks are kept.
        assert.equal(wrap("~{a b c d e} f", 5), "~{a b c d e}\nf");
        assert.equal(wrap("a_{b c} d e f g h", 5), "a_{b c}\nd\ne f\ng\nh");
        assert.equal(wrap("abcdefghijklmnop qr", 8), "abcdefghijklmnop\nqr");
        assert.equal(wrap(" ab cd", 5), "\nab\ncd");
        assert.equal(wrap("ab\ncd ef gh", 8), "ab\ncd\nef\ngh");
    });

    test(".layout_line() overbars", function () {
        // The bar covers what the braces enclose, braces within included,
        // and stops 0.1 of the width short of each end.
        const size = new Vec2(210000, 210000);
        const bars = (text: string) =>
            font
                .layout_line(text, size, false)
                .overbars.map(([a, b]) => [a / 10000, b / 10000]);

        assert.deepEqual(bars("~{abc"), []);
        assert.deepEqual(bars("a~{}b"), []);
        const [[start, end]] = bars("~{a{b}c}d") as [[number, number]];
        assert.closeTo(start, 2.1, 1e-9);
        assert.closeTo(end, 84 - 2.1, 1e-9);
        assert.equal(bars("~{a~{b}c}").length, 2);
        assert.equal(bars("~~{a}").length, 1);
    });
});
