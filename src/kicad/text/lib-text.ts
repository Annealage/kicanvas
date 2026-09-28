/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Vec2 } from "../../base/math";
import { EDAText } from "./eda-text";

/**
 * Graphic text drawn as part of a symbol (not its fields or pins).
 *
 * The text is parsed in the library's frame, y up. KiCad never draws it
 * upside down or mirrored: rotating or mirroring the symbol moves its anchor
 * with the symbol and turns the text between 0 and 90 degrees, flipping its
 * justification instead. How is not quite geometric; see rotate() and
 * apply_symbol_transformations().
 */
export class LibText extends EDAText {
    constructor(text: string) {
        super(text);
    }

    override get shown_text() {
        return this.text;
    }

    /** The unit vector the text reads along on the sheet, and the one from the tops of its glyphs to its baseline. */
    get #directions() {
        return this.text_angle.degrees == 90
            ? { reading: new Vec2(0, -1), down: new Vec2(1, 0) }
            : { reading: new Vec2(1, 0), down: new Vec2(0, 1) };
    }

    /** The text's box on the sheet, once placed by apply_symbol_transformations(). */
    get bounding_box(): BBox {
        const { reading, down } = this.#directions;
        return this.oriented_text_box(this.text_pos, reading, down);
    }

    /**
     * Where to draw the text, once placed by apply_symbol_transformations(),
     * with its vertical justification replaced by "center".
     */
    get world_pos(): Vec2 {
        const line_count = this.multiline
            ? this.shown_text.split("\n").length
            : 1;
        const pen = this.get_effective_text_thickness();
        const [here, centred] = [this.v_align, "center" as const].map(
            (v_align) =>
                this.font.get_first_baseline(
                    v_align,
                    line_count,
                    this.text_height,
                    pen,
                    this.line_spacing,
                ),
        );
        return this.text_pos.add(
            this.#directions.down.multiply(here! - centred!),
        );
    }

    /**
     * Places the text on the sheet for a symbol at `position` (millimetres)
     * turned counter-clockwise by `rotations` quarter turns and then mirrored
     * top to bottom (`mirror_x`) or left to right (`mirror_y`).
     *
     * Measured with kicad-cli 9 over every justification of text at 0 and 90
     * degrees on symbols at each rotation with each mirror: the anchor goes
     * where the symbol's transform takes it, and the angle and justification
     * end up as if these steps were applied (see rotate() and the mirrors),
     * which isn't the same for every pair of equivalent orientations.
     */
    apply_symbol_transformations(transforms: {
        position: Vec2;
        rotations: number;
        mirror_x: boolean;
        mirror_y: boolean;
    }) {
        const turns = ((transforms.rotations % 4) + 4) % 4;
        const mirror = transforms.mirror_x
            ? transforms.mirror_y
                ? "both"
                : "x"
            : transforms.mirror_y
              ? "y"
              : "none";

        const origin = new Vec2(0, 0);
        for (const step of orientation_steps[mirror][turns]!) {
            if (step == "turn") {
                this.rotate(origin, true);
            } else if (step == "mirror_x") {
                this.mirror_vertically(origin);
            } else {
                this.mirror_horizontally(origin);
            }
        }

        // Library frame (y up) to the sheet (y down).
        const at = transforms.position.multiply(10000);
        this.text_pos = new Vec2(
            at.x + this.text_pos.x,
            at.y - this.text_pos.y,
        );
    }

    /**
     * Turns the text a quarter turn about `center` in the library's frame:
     * the anchor rotates, and the text goes from 0 to 90 degrees keeping its
     * justification, or from 90 back to 0 with its horizontal justification
     * flipped (the vertical one stays). Clockwise is three counter-clockwise
     * turns.
     */
    rotate(center: Vec2, ccw = false) {
        if (!ccw) {
            for (let i = 0; i < 3; i++) {
                this.rotate(center, true);
            }
            return;
        }

        const d = this.text_pos.sub(center);
        this.text_pos = center.add(new Vec2(-d.y, d.x));

        if (this.text_angle.degrees == 90) {
            this.text_angle = new Angle(0);
            this.#flip_h_align();
        } else {
            this.text_angle = Angle.from_degrees(90);
        }
    }

    /**
     * Mirrors the text left to right about `center`: horizontal text swaps
     * left and right justification, vertical text top and bottom.
     */
    mirror_horizontally(center: Vec2) {
        this.text_pos = new Vec2(
            2 * center.x - this.text_pos.x,
            this.text_pos.y,
        );
        if (this.text_angle.degrees == 90) {
            this.#flip_v_align();
        } else {
            this.#flip_h_align();
        }
    }

    /**
     * Mirrors the text top to bottom about `center`: horizontal text swaps
     * top and bottom justification, vertical text left and right.
     */
    mirror_vertically(center: Vec2) {
        this.text_pos = new Vec2(
            this.text_pos.x,
            2 * center.y - this.text_pos.y,
        );
        if (this.text_angle.degrees == 90) {
            this.#flip_h_align();
        } else {
            this.#flip_v_align();
        }
    }

    #flip_h_align() {
        this.h_align = (
            { left: "right", center: "center", right: "left" } as const
        )[this.h_align];
    }

    #flip_v_align() {
        this.v_align = (
            { top: "bottom", center: "center", bottom: "top" } as const
        )[this.v_align];
    }
}

type Step = "turn" | "mirror_x" | "mirror_y";

/**
 * The steps that reproduce kicad-cli 9's placement of symbol text for each
 * mirror and number of counter-clockwise quarter turns. Mirrored both ways
 * is half a turn more. Among the orientations that are geometrically the
 * same, (180, mirror x) and (0, mirror y) match, as do (180, mirror y) and
 * (0, mirror x), (270, mirror x) and (90, mirror y), (270, mirror y) and
 * (90, mirror x).
 */
const orientation_steps: Record<"none" | "x" | "y" | "both", Step[][]> = {
    none: [[], ["turn"], ["turn", "turn"], ["turn", "turn", "turn"]],
    both: [["turn", "turn"], ["turn", "turn", "turn"], [], ["turn"]],
    x: [
        ["mirror_x"],
        ["turn", "mirror_x"],
        ["mirror_y"],
        ["turn", "turn", "turn", "mirror_x"],
    ],
    y: [
        ["mirror_y"],
        ["turn", "turn", "turn", "mirror_x"],
        ["mirror_x"],
        ["turn", "mirror_x"],
    ],
};
