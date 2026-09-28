/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

// Expected values are measured on kicad-cli 9 SVG exports.

import { assert } from "chai";
import { Color } from "../../../src/base/color";
import { Vec2 } from "../../../src/base/math";
import { KicadSch, SchematicSymbol } from "../../../src/kicad/schematic";
import { get_symbol_transform } from "../../../src/viewers/schematic/painters/symbol";

const sch = new KicadSch(
    "t.kicad_sch",
    `(kicad_sch (version 20250114) (generator "eeschema") (uuid "r") (paper "A4") (lib_symbols))`,
);

function symbol(rot: number, mirror?: "x" | "y") {
    const m = mirror ? `(mirror ${mirror})` : "";
    return new SchematicSymbol(
        `(symbol (lib_id "T:A") (at 10 20 ${rot}) ${m} (unit 1) (uuid "u") (property "Value" "A" (at 0 0 0)))`,
        sch,
    );
}

suite("sch.painters.symbol: instance transform", function () {
    // Library point (1, 2) (y up) as page offsets from the symbol position,
    // from fitting an asymmetric symbol's body in kicad-cli's output.
    const cases: [number, "x" | "y" | undefined, number, number][] = [
        [0, undefined, 1, -2],
        [90, undefined, -2, -1],
        [180, undefined, -1, 2],
        [270, undefined, 2, 1],
        [0, "x", 1, 2],
        [90, "x", -2, 1],
        [180, "x", -1, -2],
        [270, "x", 2, -1],
        [0, "y", -1, -2],
        [90, "y", 2, -1],
        [180, "y", 1, 2],
        [270, "y", -2, 1],
    ];

    for (const [rot, mirror, x, y] of cases) {
        test(`rotation ${rot} mirror ${mirror ?? "none"}`, function () {
            const t = get_symbol_transform(symbol(rot, mirror));
            const p = t.matrix.transform(new Vec2(1, 2));
            assert.closeTo(p.x, x, 1e-9);
            assert.closeTo(p.y, y, 1e-9);
            assert.equal(t.rotations, rot / 90);
            assert.equal(t.mirror_x, mirror == "x");
            assert.equal(t.mirror_y, mirror == "y");
        });
    }
});

suite("sch.painters.symbol: DNP dimming", function () {
    // kicad-cli draws a DNP symbol's colours as below over #F5F4EF.
    const background = Color.from_css("#F5F4EF");
    const cases: [string, string][] = [
        ["#840000", "#9B9B98"],
        ["#006464", "#939390"],
        ["#A90000", "#A4A4A1"],
        ["#FFFFC2", "#EAEAE7"],
    ];

    for (const [from, to] of cases) {
        test(`${from} dims to ${to}`, function () {
            const dimmed = Color.from_css(from)
                .desaturate()
                .mix(background, 0.5);
            const want = Color.from_css(to);
            // kicad-cli writes whole 8-bit channels, truncated.
            assert.closeTo(dimmed.r_255, want.r_255, 1);
            assert.closeTo(dimmed.g_255, want.g_255, 1);
            assert.closeTo(dimmed.b_255, want.b_255, 1);
        });
    }

    test("desaturate keeps alpha", function () {
        assert.equal(new Color(1, 0, 0, 0.5).desaturate().a, 0.5);
    });
});

suite("kicad.schematic: instance data", function () {
    const lib = `(lib_symbols (symbol "T:A" (symbol "A_1_1") (symbol "A_2_1")))`;

    test("KiCad 7+: reference and unit for the page's instance path", function () {
        const child = new KicadSch(
            "c.kicad_sch",
            `(kicad_sch (version 20250114) (uuid "c") ${lib}
              (symbol (lib_id "T:A") (at 0 0 0) (unit 1) (uuid "m")
                (property "Reference" "M?" (at 0 0 0))
                (property "Value" "A" (at 0 0 0))
                (instances (project "p"
                  (path "/r/sa" (reference "M10") (unit 1))
                  (path "/r/sb" (reference "M11") (unit 2))))))`,
        );
        // kicad-cli shows M10A on the first sheet and M11B on the second.
        child.update_hierarchical_data("/r/sb");
        const m = child.symbols.get("m")!;
        assert.equal(m.reference, "M11");
        assert.equal(m.unit, 2);
        child.update_hierarchical_data("/r/sa");
        assert.equal(m.reference, "M10");
        assert.equal(m.unit, 1);
    });

    test("KiCad 6: per-page reference, the last entry's value", function () {
        const sch6 = new KicadSch(
            "r.kicad_sch",
            `(kicad_sch (version 20211123) (uuid "r") ${lib}
              (symbol (lib_id "T:A") (at 0 0 0) (unit 1) (uuid "u")
                (property "Reference" "U?" (id 0) (at 0 0 0))
                (property "Value" "ONE" (id 1) (at 0 0 0)))
              (symbol_instances
                (path "/sa/u" (reference "U10") (unit 1) (value "V10") (footprint ""))
                (path "/sb/u" (reference "U11") (unit 1) (value "V11") (footprint ""))))`,
        );
        // kicad-cli shows U10 and U11, both with value V11.
        const u = sch6.symbols.get("u")!;
        sch6.update_hierarchical_data("/sa");
        assert.equal(u.reference, "U10");
        assert.equal(u.value, "V11");
        sch6.update_hierarchical_data("/sb");
        assert.equal(u.reference, "U11");
        assert.equal(u.value, "V11");
    });
});
