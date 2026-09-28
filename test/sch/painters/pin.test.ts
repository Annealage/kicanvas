/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

// Expected values are measured on kicad-cli 9 SVG exports of the same pins.

import { assert } from "chai";
import { Vec2 } from "../../../src/base/math";
import {
    pin_graphics,
    pin_text_placements,
    type PlacedPin,
} from "../../../src/viewers/schematic/painters/pin";

function assert_point(actual: Vec2, x: number, y: number, tol = 1e-6) {
    assert.closeTo(actual.x, x, tol, `x of (${actual.x}, ${actual.y})`);
    assert.closeTo(actual.y, y, tol, `y of (${actual.x}, ${actual.y})`);
}

// A pin on the left of a body, connecting at the origin and pointing right.
const right: PlacedPin = {
    connection: new Vec2(0, 0),
    direction: new Vec2(1, 0),
    length: 2.54,
};
// A pin below a body, pointing up.
const up: PlacedPin = {
    connection: new Vec2(0, 0),
    direction: new Vec2(0, -1),
    length: 2.54,
};

suite("sch.painters.pin: graphic styles", function () {
    test("line", function () {
        const { lines, circles } = pin_graphics(right, "line", "input");
        assert.equal(lines.length, 1);
        assert.equal(circles.length, 0);
        assert_point(lines[0]![1]!, 2.54, 0);
    });

    test("inverted stops the line at the bubble", function () {
        const { lines, circles } = pin_graphics(right, "inverted", "input");
        assert_point(lines[0]![1]!, 1.27, 0);
        assert_point(circles[0]!.center, 1.905, 0);
        assert.closeTo(circles[0]!.radius, 0.635, 1e-9);
    });

    test("clock wedge sits inside the body", function () {
        const { lines } = pin_graphics(right, "clock", "input");
        assert_point(lines[1]![0]!, 2.54, -0.635);
        assert_point(lines[1]![1]!, 3.81, 0);
        assert_point(lines[1]![2]!, 2.54, 0.635);
    });

    test("active-low mark is above a horizontal pin, left of a vertical one", function () {
        const h = pin_graphics(right, "input_low", "input").lines[1]!;
        assert_point(h[1]!, 1.27, -1.27);
        const v = pin_graphics(up, "input_low", "input").lines[1]!;
        assert_point(v[1]!, -1.27, -1.27);
        const out = pin_graphics(right, "output_low", "input").lines[1]!;
        assert_point(out[0]!, 2.54, -1.27);
        assert_point(out[1]!, 1.27, 0);
    });

    test("falling edge clock is outside the body", function () {
        const { lines } = pin_graphics(right, "edge_clock_high", "input");
        assert_point(lines[0]![1]!, 1.27, 0);
        assert_point(lines[1]![1]!, 1.27, 0);
    });

    test("non-logic cross is centred on the pin's end", function () {
        const { lines } = pin_graphics(right, "non_logic", "input");
        const xs = lines
            .slice(1)
            .flat()
            .map((p) => p.x);
        assert.closeTo(Math.min(...xs), 1.905, 1e-9);
        assert.closeTo(Math.max(...xs), 3.175, 1e-9);
    });

    test("no_connect pins get an X on the connection point", function () {
        const { lines } = pin_graphics(right, "line", "no_connect");
        assert.equal(lines.length, 3);
        assert_point(lines[1]![0]!, -0.381, -0.381);
    });
});

suite("sch.painters.pin: names and numbers", function () {
    test("with a name offset the name is inside and the number above", function () {
        const { name, number } = pin_text_placements(right, 0.508);
        assert_point(name.position, 3.048, 0);
        assert.equal(name.h_align, "left");
        assert.equal(name.v_align, "center");
        assert_point(number.position, 1.27, -0.254);
        assert.equal(number.v_align, "bottom");
    });

    test("vertical pins write upwards, above meaning to the left", function () {
        const { name, number } = pin_text_placements(up, 0.508);
        assert.equal(name.angle, 90);
        assert.equal(name.h_align, "left");
        assert_point(name.position, 0, -3.048);
        assert_point(number.position, -0.254, -1.27);

        const down = pin_text_placements(
            { ...up, direction: new Vec2(0, 1) },
            0.508,
        );
        assert.equal(down.name.h_align, "right");
    });

    test("with no offset the name is above and the number below", function () {
        const { name, number } = pin_text_placements(right, 0);
        assert_point(name.position, 1.27, -0.254);
        assert.equal(name.v_align, "bottom");
        assert_point(number.position, 1.27, 0.254);
        assert.equal(number.v_align, "top");
    });
});
