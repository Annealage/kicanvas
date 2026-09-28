/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Vec2 } from "../../base/math";

/**
 * A glyph placed in text: its shape plus the box it advances the pen by.
 */
export abstract class Glyph {
    /** The advance box: x from 0 to the advance width, y from the glyph's top to its baseline. */
    abstract get bbox(): BBox;

    /**
     * Places the glyph.
     *
     * @param glyph_size - width and height of the glyph (the text size)
     * @param offset - where the start of the advance box sits on the baseline
     * @param tilt - italic slant, as x shift per unit of height
     * @param angle - rotation about `origin`, counter-clockwise on screen
     * @param mirror - whether to reflect x about `origin`
     */
    abstract transform(
        glyph_size: Vec2,
        offset: Vec2,
        tilt: number,
        angle: Angle,
        mirror: boolean,
        origin: Vec2,
    ): Glyph;
}

type Stroke = Vec2[];

/**
 * A glyph drawn as pen strokes, in em units: one unit is the text size, x runs
 * from the start of the advance box and y from the baseline (negative is up).
 */
export class StrokeGlyph extends Glyph {
    constructor(
        public strokes: Stroke[],
        public bbox: BBox,
    ) {
        super();
    }

    override transform(
        glyph_size: Vec2,
        offset: Vec2,
        tilt: number,
        angle: Angle,
        mirror: boolean,
        origin: Vec2,
    ): StrokeGlyph {
        // KiCad slants italics about a line one font unit (1/21 em) above
        // each glyph's baseline: measured on kicad-cli 9 SVG output, where an
        // italic "H" stem at 21 mm leans 0.125 mm left at the baseline and
        // 2.5 mm right at the cap height.
        const pivot = -glyph_size.y / 21;
        const cos = Math.cos(angle.radians);
        const sin = Math.sin(angle.radians);

        const place = (p: Vec2) => {
            let x = p.x * glyph_size.x;
            const y = p.y * glyph_size.y;
            x -= tilt * (y - pivot);
            x += offset.x - origin.x;
            const dy = offset.y + y - origin.y;
            if (mirror) {
                x = -x;
            }
            // Counter-clockwise on screen, where y points down.
            return new Vec2(
                origin.x + x * cos + dy * sin,
                origin.y - x * sin + dy * cos,
            );
        };

        const strokes = this.strokes.map((stroke) => stroke.map(place));

        const bbox = new BBox(
            offset.x + this.bbox.x * glyph_size.x,
            offset.y + this.bbox.y * glyph_size.y,
            this.bbox.w * glyph_size.x,
            this.bbox.h * glyph_size.y,
        );

        return new StrokeGlyph(strokes, bbox);
    }
}
