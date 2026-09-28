/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

// Expected values are measured on kicad-cli 9 SVG exports of the same labels.

import { assert } from "chai";
import type { Vec2 } from "../../../src/base/math";
import {
    DirectiveLabel,
    GlobalLabel,
    HierarchicalLabel,
    NetLabel,
    SchematicSheet,
} from "../../../src/kicad/schematic";
import {
    directive_label_geometry,
    global_label_geometry,
    hierarchical_label_geometry,
    local_label_text,
} from "../../../src/viewers/schematic/painters/label";

function assert_point(actual: Vec2, x: number, y: number, tol = 0.001) {
    assert.closeTo(actual.x, x, tol, `x of (${actual.x}, ${actual.y})`);
    assert.closeTo(actual.y, y, tol, `y of (${actual.x}, ${actual.y})`);
}

const effects = (size: number, extra = "") =>
    `(effects (font (size ${size} ${size})${extra}) (justify left))`;

suite("sch.painters.label: local labels", function () {
    test("text is raised 0.15s + t off the wire, upright", function () {
        const at0 = local_label_text(
            new NetLabel(`(label "A" (at 20 20 0) ${effects(1.27)})`),
        );
        assert_point(at0.position, 20, 20 - 0.3493);
        assert.equal(at0.angle, 0);
        assert.equal(at0.h_align, "left");
        assert.equal(at0.v_align, "bottom");

        const at90 = local_label_text(
            new NetLabel(`(label "A" (at 20 20 90) ${effects(2.54)})`),
        );
        assert_point(at90.position, 20 - 0.6985, 20);
        assert.equal(at90.angle, 90);
        assert.equal(at90.h_align, "left");

        const at180 = local_label_text(
            new NetLabel(`(label "A" (at 20 20 180) ${effects(1.27)})`),
        );
        assert.equal(at180.angle, 0);
        assert.equal(at180.h_align, "right");
    });

    test("an explicit thickness sets the raise", function () {
        const bold = local_label_text(
            new NetLabel(
                `(label "A" (at 0 0 0) ${effects(1.27, " (bold yes)")})`,
            ),
        );
        assert_point(bold.position, 0, -0.4445);

        const thick = local_label_text(
            new NetLabel(
                `(label "A" (at 0 0 0) ${effects(2, " (thickness 0.3)")})`,
            ),
        );
        assert_point(thick.position, 0, -0.5998);
    });
});

suite("sch.painters.label: hierarchical labels", function () {
    test("input flag is s long whatever the text", function () {
        const g = hierarchical_label_geometry(
            new HierarchicalLabel(
                `(hierarchical_label "Hinp0" (shape input) (at 0 0 0) ${effects(1.27)})`,
            ),
        );
        const expected = [
            [0, 0],
            [0.635, 0.635],
            [1.27, 0.635],
            [1.27, -0.635],
            [0.635, -0.635],
            [0, 0],
        ];
        assert.equal(g.outline.length, expected.length);
        for (const [x, y] of expected) {
            assert.isTrue(
                g.outline.some(
                    (p) =>
                        Math.abs(p.x - x!) < 1e-6 && Math.abs(p.y - y!) < 1e-6,
                ),
                `vertex (${x}, ${y})`,
            );
        }
        assert_point(g.text.position, 1.4604, 0);
    });

    test("rotation 270 points down with right-aligned vertical text", function () {
        const g = hierarchical_label_geometry(
            new HierarchicalLabel(
                `(hierarchical_label "H" (shape passive) (at 10 10 270) ${effects(2)})`,
            ),
        );
        assert_point(g.text.position, 10, 12.3);
        assert.equal(g.text.angle, 90);
        assert.equal(g.text.h_align, "right");
        const ys = g.outline.map((p) => p.y);
        assert.closeTo(Math.max(...ys), 12, 1e-6);
        assert.closeTo(Math.min(...ys), 10, 1e-6);
    });
});

suite("sch.painters.label: global labels", function () {
    test("box height, arrow depth and text inset", function () {
        const g = global_label_geometry(
            new GlobalLabel(
                `(global_label "Ginp0" (shape input) (at 0 0 0) ${effects(1.27)})`,
            ),
        );
        // kicad-cli: shoulders at (1.1113, +-1.2704), text anchor (1.4287, 0.0909)
        assert_point(g.outline[1]!, 1.1113, -1.2704);
        assert_point(g.outline[5]!, 1.1113, 1.2704);
        assert_point(g.text.position, 1.4287, 0.0909);
    });

    test("pointed ends add 0.875s", function () {
        const at = (shape: string) =>
            global_label_geometry(
                new GlobalLabel(
                    `(global_label "C021Wg" (shape ${shape}) (at 0 0 0) ${effects(1.27)})`,
                ),
            ).outline;
        const tip = (pts: Vec2[]) => Math.max(...pts.map((p) => p.x));
        // kicad-cli: passive 8.8330, input and output 9.9443, bidirectional 11.0556
        assert.closeTo(tip(at("input")) - tip(at("passive")), 1.1113, 0.001);
        assert.closeTo(tip(at("output")) - tip(at("passive")), 1.1113, 0.001);
        assert.closeTo(
            tip(at("bidirectional")) - tip(at("passive")),
            2.2226,
            0.001,
        );
    });
});

suite("sch.painters.label: netclass flags", function () {
    const flag = (shape: string, rot: number) =>
        new DirectiveLabel(
            `(netclass_flag "" (length 2.54) (shape ${shape}) (at 0 0 ${rot}) ${effects(1.27)})`,
            null! as SchematicSheet,
        );

    test("dot flag points up at rotation 0 and left at 90", function () {
        const up = directive_label_geometry(flag("dot", 0));
        assert_point(up.lines[0]![1]!, 0, -2.1844);
        assert_point(up.circles[0]!.center, 0, -2.54);
        assert.closeTo(up.circles[0]!.radius, 0.3556, 1e-6);
        assert.isTrue(up.circles[0]!.filled);

        const left = directive_label_geometry(flag("dot", 90));
        assert_point(left.circles[0]!.center, -2.54, 0);
    });

    test("rectangle head is 1.6256 x 0.8128 on the stem end", function () {
        const g = directive_label_geometry(flag("rectangle", 0));
        const pts = g.lines[0]!;
        assert_point(pts[1]!, 0, -2.1336);
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        assert.closeTo(Math.max(...xs), 0.8128, 1e-6);
        assert.closeTo(Math.min(...ys), -2.9464, 1e-6);
    });
});
