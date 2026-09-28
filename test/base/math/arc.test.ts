/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";
import { Angle, Arc, Vec2 } from "../../../src/base/math";

// Angles grow clockwise as drawn: +y is down, so 90 degrees is straight down.
function on_circle(center: Vec2, r: number, degrees: number) {
    const t = Angle.deg_to_rad(degrees);
    return new Vec2(center.x + r * Math.cos(t), center.y + r * Math.sin(t));
}

function assert_near(actual: Vec2, expected: Vec2, tolerance = 1e-9) {
    assert.isBelow(
        actual.sub(expected).magnitude,
        tolerance,
        `${actual.x},${actual.y} != ${expected.x},${expected.y}`,
    );
}

suite("base.math.Arc", function () {
    test("start, mid and end points lie where the polyline walks", function () {
        const c = new Vec2(1, 2);
        const arc = new Arc(
            c,
            3,
            Angle.from_degrees(20),
            Angle.from_degrees(110),
            0.1,
        );

        assert_near(arc.start_point, on_circle(c, 3, 20));
        assert_near(arc.mid_point, on_circle(c, 3, 65));
        assert_near(arc.end_point, on_circle(c, 3, 110));
    });

    test("polyline runs from start to end exactly, either direction", function () {
        const c = new Vec2(-4, 7);
        const [a, b, d] = [10, 40, 75].map((deg) => on_circle(c, 5, deg));

        const cw = Arc.from_three_points(a!, b!, d!);
        const ccw = Arc.from_three_points(d!, b!, a!);
        assert.equal(cw.direction, "clockwise");
        assert.equal(ccw.direction, "counter-clockwise");

        for (const [arc, first, last] of [
            [cw, a!, d!],
            [ccw, d!, a!],
        ] as const) {
            const points = arc.to_polyline();
            const [start, end] =
                arc.direction == "clockwise"
                    ? [arc.start_point, arc.end_point]
                    : [arc.end_point, arc.start_point];
            assert.isTrue(points[0]!.equals(start));
            assert.isTrue(points[points.length - 1]!.equals(end));
            // Within the 0.01 degree the angles are rounded to.
            assert_near(points[0]!, first, 1e-3);
            assert_near(points[points.length - 1]!, last, 1e-3);
        }
    });

    test("bbox takes in the axis extremes the sweep crosses", function () {
        const c = new Vec2(0, 0);
        // Through 270 degrees (straight up) and 0 (right).
        const arc = new Arc(
            c,
            2,
            Angle.from_degrees(200),
            Angle.from_degrees(380),
            0.1,
        );
        const bbox = arc.bbox;

        assert.closeTo(bbox.y, -2, 1e-9);
        assert.closeTo(bbox.x2, 2, 1e-9);
        assert.closeTo(bbox.x, on_circle(c, 2, 200).x, 1e-9);
        assert.closeTo(bbox.y2, on_circle(c, 2, 380).y, 1e-9);

        for (const p of arc.to_polyline()) {
            assert.isAtLeast(p.x, bbox.x - 1e-9);
            assert.isAtMost(p.x, bbox.x2 + 1e-9);
            assert.isAtLeast(p.y, bbox.y - 1e-9);
            assert.isAtMost(p.y, bbox.y2 + 1e-9);
        }
    });
});
