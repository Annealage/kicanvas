/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Matrix3, Vec2 } from "../../base/math";
import { EDAText } from "./eda-text";

type Parent = {
    position: Vec2;
    /** Maps offsets from `position` in the parent's own frame to the sheet. */
    transform: Matrix3;
    /** Symbols' own frame has y up, so their transform includes a flip. */
    is_symbol: boolean;
};

/**
 * A field of a symbol or sheet: reference, value, and other properties.
 *
 * `text_pos` and the field's angle and justification are in the parent's
 * frame. KiCad places a field by building its text box (see
 * EDAText.text_box_size) in that frame, carrying the box through the parent's
 * orientation, and drawing the text centred in the result, horizontally or
 * vertically, never upside down or mirrored. Measured with kicad-cli 9 over
 * every field justification and rotation on symbols in all eight
 * orientations.
 */
export class SchField extends EDAText {
    constructor(
        text: string,
        public parent?: Parent,
    ) {
        super(text);
    }

    override get shown_text() {
        return this.text == "~" ? "" : this.text;
    }

    /** The field's position on the sheet. */
    get position(): Vec2 {
        if (!this.parent) {
            return this.text_pos;
        }
        const origin = this.parent.position;
        return this.parent.transform
            .transform(this.text_pos.sub(origin))
            .add(origin);
    }

    /**
     * The parent's rotation and mirroring on the sheet, without the flip of
     * a symbol's y-up frame, applied to a direction.
     */
    #orient(v: Vec2): Vec2 {
        if (!this.parent) {
            return v;
        }
        const m = this.parent.transform;
        const flipped = this.parent.is_symbol ? new Vec2(v.x, -v.y) : v;
        return m.transform(flipped).sub(m.transform(new Vec2(0, 0)));
    }

    /** The field's reading direction on the sheet. */
    get #reading_direction(): Vec2 {
        const a = this.text_angle.radians;
        return this.#orient(new Vec2(Math.cos(a), -Math.sin(a)));
    }

    /** The angle to draw the text at: 0 or 90 degrees. */
    get draw_rotation(): Angle {
        const reading = this.#reading_direction;
        return Angle.from_degrees(
            Math.abs(reading.y) > Math.abs(reading.x) ? 90 : 0,
        );
    }

    /** The field's text box on the sheet; the text is drawn centred in it. */
    get bounding_box(): BBox {
        const a = this.text_angle.radians;
        return this.oriented_text_box(
            this.position,
            this.#reading_direction,
            this.#orient(new Vec2(Math.sin(a), Math.cos(a))),
        );
    }
}
