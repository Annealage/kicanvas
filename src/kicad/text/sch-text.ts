/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle } from "../../base/math";
import { At } from "../common";
import { EDAText } from "./eda-text";

/**
 * Text placed on a schematic sheet with the Text tool, and the text of labels
 * and pins, which spin the same way.
 */
export class SchText extends EDAText {
    constructor(text: string) {
        super(text);
    }

    override apply_at(at: At): void {
        super.apply_at(at);
        this.set_spin_style_from_angle(this.text_angle);
    }

    /**
     * Schematic text only ever reads left to right or bottom to top. The
     * other two directions (180 and 270 degrees) are drawn as those, with the
     * text right-justified so it still grows away from its anchor the same
     * way. The text sits on its anchor (bottom-justified).
     */
    set_spin_style_from_angle(a: Angle) {
        const degrees = ((Math.round(a.degrees) % 360) + 360) % 360;
        const reversed = degrees == 180 || degrees == 270;
        this.text_angle = Angle.from_degrees(
            degrees == 90 || degrees == 270 ? 90 : 0,
        );
        this.h_align = reversed ? "right" : "left";
        this.v_align = "bottom";
    }

    override get shown_text() {
        return this.text;
    }
}
