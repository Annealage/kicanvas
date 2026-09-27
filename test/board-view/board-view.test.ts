/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";
import {
    BoardView,
    type ClickEvent,
    type Selection,
} from "../../src/board-view";
import board_src from "./files/two-parts.kicad_pcb";

// two-parts.kicad_pcb: a 30 x 20 mm outline; R1 at (10, 10) with pad 1 (GND)
// at (9.2, 10); R2 at (20, 10) rotated 90 degrees with pad 1 (SIG) at
// (20, 10.8); a SIG track on F.Cu from R1.2 to R2.1; a GND track on B.Cu
// along y = 15 ending in a via at (25, 15).

suite("board-view.BoardView", function () {
    let canvas: HTMLCanvasElement;
    let view: BoardView;
    let clicks: ClickEvent[];
    let selects: Selection[];

    setup(async function () {
        if (!document.createElement("canvas").getContext("webgl2")) {
            this.skip();
        }
        canvas = document.createElement("canvas");
        canvas.style.display = "block";
        canvas.style.width = "600px";
        canvas.style.height = "400px";
        document.body.appendChild(canvas);

        view = new BoardView(canvas);
        await view.load(board_src, "two-parts.kicad_pcb");
        clicks = [];
        selects = [];
        view.on("click", (e) => clicks.push(e));
        view.on("select", (s) => selects.push(s));
    });

    teardown(function () {
        view?.dispose();
        canvas?.remove();
    });

    // Client coordinates of board point (x, y), rounded as synthetic mouse
    // events round them.
    function pointer_at(x: number, y: number) {
        const [px, py] = view.worldToScreen([x, y]);
        const rect = canvas.getBoundingClientRect();
        return {
            clientX: Math.round(rect.left + px),
            clientY: Math.round(rect.top + py),
        };
    }

    function click_at(x: number, y: number) {
        const init = {
            ...pointer_at(x, y),
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            bubbles: true,
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", init));
        canvas.dispatchEvent(new PointerEvent("pointerup", init));
    }

    test("first load fits the outline, centred, with a small margin", function () {
        const [x0, y0] = view.worldToScreen([0, 0]);
        const [x1, y1] = view.worldToScreen([30, 20]);
        assert.closeTo((x0 + x1) / 2, 300, 1);
        assert.closeTo((y0 + y1) / 2, 200, 1);
        // Height-limited: the outline fills most of the 400 px, not all.
        assert.isAbove(y1 - y0, 0.85 * 400);
        assert.isBelow(y1 - y0, 400);

        const [wx, wy] = view.screenToWorld(view.worldToScreen([12.5, 7.25]));
        assert.closeTo(wx, 12.5, 1e-4);
        assert.closeTo(wy, 7.25, 1e-4);
    });

    test("a click on a pad lists it first and selects its footprint", function () {
        click_at(9.2, 10);
        assert.deepEqual(clicks[0]!.items[0], {
            kind: "pad",
            ref: "R1",
            pad: "1",
            net: "GND",
        });
        assert.deepInclude(clicks[0]!.items, { kind: "footprint", ref: "R1" });
        assert.deepEqual(selects, [{ kind: "footprint", ref: "R1" }]);
    });

    test("pads of a rotated footprint are hit where they're drawn", function () {
        click_at(20, 10.8);
        assert.deepEqual(clicks[0]!.items[0], {
            kind: "pad",
            ref: "R2",
            pad: "1",
            net: "SIG",
        });
    });

    test("a track click selects its net; hidden layers can't be clicked", function () {
        click_at(15, 15);
        assert.deepEqual(clicks[0]!.items[0], {
            kind: "track",
            net: "GND",
            layer: "B.Cu",
        });
        assert.deepEqual(view.selection, { kind: "net", net: "GND" });

        view.setLayerVisible("B.Cu", false);
        click_at(15, 15);
        assert.deepEqual(clicks[1]!.items, []);
        assert.deepEqual(selects, [{ kind: "net", net: "GND" }, null]);
    });

    test("hiding the Pads group makes pads unclickable", function () {
        view.setLayerVisible("Pads", false);
        click_at(9.2, 10);
        assert.notDeepInclude(clicks[0]!.items, {
            kind: "pad",
            ref: "R1",
            pad: "1",
            net: "GND",
        });
    });

    test("preventDefault in a click handler keeps the selection", function () {
        view.select({ ref: "R1" });
        view.on("click", (e) => e.preventDefault());
        click_at(15, 15);
        assert.isTrue(clicks[0]!.defaultPrevented);
        assert.deepEqual(view.selection, { kind: "footprint", ref: "R1" });
        assert.deepEqual(selects, [{ kind: "footprint", ref: "R1" }]);
    });

    test("select() refuses unknown references and nets without an event", function () {
        assert.isFalse(view.select({ ref: "R9" }));
        assert.isFalse(view.select({ net: "NOPE" }));
        // Net 0 is "no net"; selecting it would highlight everything.
        assert.isFalse(view.select({ net: "" }));
        assert.deepEqual(selects, []);
        assert.isTrue(view.select({ net: "SIG" }));
        assert.deepEqual(selects, [{ kind: "net", net: "SIG" }]);
    });

    test("reload keeps camera and visibility, and drops a vanished selection", async function () {
        view.setLayerVisible("F.SilkS", false);
        view.zoomTo([0, 0, 10, 10]);
        view.select({ ref: "R2" });
        const before = view.worldToScreen([5, 5]);

        await view.load(
            board_src.replace('"R2"', '"R3"'),
            "two-parts.kicad_pcb",
        );

        assert.deepEqual(view.worldToScreen([5, 5]), before);
        const silk = view.layers().find((l) => l.name == "F.SilkS");
        assert.isFalse(silk!.visible);
        assert.isNull(view.selection);
        assert.deepEqual(selects.at(-1), null);
    });

    test("presets show one side and the outline", function () {
        view.preset("bottom");
        const visible = view
            .layers()
            .filter((l) => l.kind != "virtual" && l.visible)
            .map((l) => l.name);
        assert.sameMembers(visible, ["B.Cu", "Edge.Cuts"]);
    });

    test("the wheel zooms about the cursor", function () {
        const at = pointer_at(12, 6);
        const rect = canvas.getBoundingClientRect();
        const cursor: [number, number] = [
            at.clientX - rect.left,
            at.clientY - rect.top,
        ];
        const scale = () =>
            view.worldToScreen([10, 0])[0] - view.worldToScreen([0, 0])[0];
        const scale_before = scale();
        const [x0, y0] = view.screenToWorld(cursor);

        canvas.dispatchEvent(
            new WheelEvent("wheel", {
                ...at,
                deltaY: -100,
                bubbles: true,
                cancelable: true,
            }),
        );

        assert.isAbove(scale(), scale_before * 1.1);
        const [x1, y1] = view.screenToWorld(cursor);
        assert.closeTo(x1, x0, 1e-4);
        assert.closeTo(y1, y0, 1e-4);
    });
});
