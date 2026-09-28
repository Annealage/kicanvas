/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Vec2 } from "../../base/math";
import { Font, TextStyle, type VAlign } from "./font";
import { StrokeGlyph } from "./glyph";
import * as newstroke from "./newstroke-glyphs";

/**
 * Newstroke, the plotter font KiCad draws text with, laid out the way
 * KiCad 9 lays it out.
 *
 * The metrics below were measured from kicad-cli 9's SVG output (`pcb export
 * svg`, and `sch export svg` for the text box), mostly on text 21 mm tall so
 * that one font unit is one millimetre. "h" and "w" are the text's height and
 * width, "pen" its stroke width.
 */
export class StrokeFont extends Font {
    /** Font units per em: the cap height of Newstroke's glyphs. */
    static readonly units_per_em = 21;

    /**
     * Baseline pitch of multi-line text, per unit of height: ten lines of
     * "H" 100 mm tall span 1448.95 mm.
     */
    static readonly interline_ratio = 1.609944;

    /**
     * Where a single line's baseline sits below its anchor, per unit of
     * height, for each vertical justification (negative is above): with a
     * hairline pen, 22 mm below a top anchor, 2.57 mm above a bottom one and
     * midway between for a centre one, at 21 mm. A thicker pen raises all
     * three by pen_baseline_rise times its width.
     */
    static readonly baseline_by_v_align: Record<VAlign, number> = {
        top: 22 / 21,
        center: (22 - 2.57) / 2 / 21,
        bottom: -2.57 / 21,
    };
    static readonly pen_baseline_rise = 0.052;

    /**
     * How far left- and right-justified text keeps from its anchor, per unit
     * of pen width: 3.2895 mm for a 5 mm pen, whatever the text's size.
     * Centred text keeps none.
     */
    static readonly justification_margin_ratio = 0.6579;

    /** Size of subscripts and superscripts, relative to the text. */
    static readonly script_scale = 0.8;

    /**
     * How far subscripts drop and superscripts rise, per unit of the text's
     * height: 2.32 mm and 6.08 mm at 21 mm, measured baseline to baseline.
     * Nested markup doesn't compound, and a subscript anywhere in the nesting
     * wins over a superscript.
     */
    static readonly subscript_drop = 2.32 / 21;
    static readonly superscript_rise = 6.08 / 21;

    /**
     * Overbars are drawn 26.83 mm above the baseline of 21 mm text, whatever
     * the pen, and stop 0.1 of the text's width short of each end of what
     * they cover. Neither changes inside a subscript or superscript, or with
     * italics.
     */
    static readonly overbar_height_ratio = 26.83 / 21;
    static readonly overbar_inset_ratio = 0.1;

    /**
     * Tab stops, in units of the text's width, counted from the start of the
     * run of text (markup starts a new run): 4k - 5/21, for the smallest k
     * both past the characters so far in groups of four and past the pen.
     * Subscripts use the full-size stops.
     */
    static readonly tab_pitch = 4;
    static readonly tab_stop_offset = 5 / 21;

    /**
     * The text box, measured from where kicad-cli 9 centres schematic fields
     * (at the middle of this box):
     *
     * - as wide as the widest line's advance less 0.2 of the width its last
     *   glyph was drawn at, plus three pen widths;
     * - 0.83 times (the first line's extent plus three pen widths) tall, each
     *   further line adding the interline. The extent is the height, or when
     *   the first line is all superscript or all subscript, 0.52 or 0.92 of
     *   it (fields of each at 5 and 10 mm are 0.3984 and 0.0664 of the height
     *   shorter). An overbar on the first line adds a sixth of its extent and
     *   half a pen.
     */
    static readonly box_trailing_ratio = 0.2;
    static readonly box_pen_ratio = 3;
    static readonly box_height_ratio = 0.83;
    static readonly box_extent_by_script = {
        none: 1,
        superscript: 0.52,
        subscript: 0.92,
    };
    static readonly box_overbar_ratio = 1 / 6;

    private static instance?: StrokeFont;

    /** The Newstroke font, shared. */
    static default(): StrokeFont {
        if (!StrokeFont.instance) {
            StrokeFont.instance = new StrokeFont();
        }
        return StrokeFont.instance;
    }

    #glyphs: Map<number, StrokeGlyph> = new Map();

    constructor() {
        super("stroke");
    }

    /**
     * The glyph for a character. Characters outside the bundled range are
     * drawn as "?".
     */
    get_glyph(c: string): StrokeGlyph {
        const code = c.codePointAt(0)!;
        let glyph = this.#glyphs.get(code);
        if (!glyph) {
            const data =
                newstroke.glyph_data[code - newstroke.first_code_point];
            if (data === undefined) {
                return this.get_glyph("?");
            }
            glyph = decode_glyph(
                typeof data == "number" ? newstroke.shared_glyphs[data]! : data,
            );
            this.#glyphs.set(code, glyph);
        }
        return glyph;
    }

    override get_interline(glyph_height: number, line_spacing = 1): number {
        return glyph_height * StrokeFont.interline_ratio * line_spacing;
    }

    override compute_overbar_vertical_position(glyph_height: number): number {
        return glyph_height * StrokeFont.overbar_height_ratio;
    }

    override get_first_baseline(
        v_align: VAlign,
        line_count: number,
        glyph_height: number,
        pen_width: number,
        line_spacing = 1,
    ): number {
        // A multi-line block hangs its first line from a top anchor, stands
        // its last line on a bottom anchor and centres its middle on a centre
        // anchor, each placed as a single line would be.
        const block =
            (line_count - 1) * this.get_interline(glyph_height, line_spacing);
        const shift = { top: 0, center: block / 2, bottom: block }[v_align];
        return (
            glyph_height * StrokeFont.baseline_by_v_align[v_align] -
            pen_width * StrokeFont.pen_baseline_rise -
            shift
        );
    }

    override get_justification_margin(pen_width: number): number {
        return pen_width * StrokeFont.justification_margin_ratio;
    }

    override get_overbar_inset(glyph_width: number): number {
        return glyph_width * StrokeFont.overbar_inset_ratio;
    }

    override get_text_box_size(
        text: string,
        size: Vec2,
        pen_width: number,
        multiline: boolean,
        line_spacing = 1,
    ): Vec2 {
        const layouts = (multiline ? text.split("\n") : [text]).map((line) =>
            this.layout_line(line, size, false),
        );

        let width = 0;
        for (const layout of layouts) {
            width = Math.max(
                width,
                layout.width -
                    StrokeFont.box_trailing_ratio * layout.last_glyph_width,
            );
        }

        const first = layouts[0]!;
        const extent =
            size.y *
            Math.max(
                ...first.scripts.map(
                    (script) => StrokeFont.box_extent_by_script[script],
                ),
                first.scripts.length ? 0 : 1,
            );
        let height =
            StrokeFont.box_height_ratio *
                (extent + StrokeFont.box_pen_ratio * pen_width) +
            (layouts.length - 1) * this.get_interline(size.y, line_spacing);
        if (first.overbars.length) {
            height += extent * StrokeFont.box_overbar_ratio + pen_width / 2;
        }

        return new Vec2(width + StrokeFont.box_pen_ratio * pen_width, height);
    }

    override get_text_as_glyphs(
        text: string,
        size: Vec2,
        position: Vec2,
        angle: Angle,
        mirror: boolean,
        origin: Vec2,
        style: TextStyle,
    ): { bbox: BBox; glyphs: StrokeGlyph[]; cursor: Vec2 } {
        let glyph_size = size;
        let baseline = position.y;
        if (style.subscript) {
            glyph_size = size.multiply(StrokeFont.script_scale);
            baseline += size.y * StrokeFont.subscript_drop;
        } else if (style.superscript) {
            glyph_size = size.multiply(StrokeFont.script_scale);
            baseline -= size.y * StrokeFont.superscript_rise;
        }
        const tilt = style.italic ? Font.italic_tilt : 0;

        const glyphs: StrokeGlyph[] = [];
        let x = position.x;
        let column = 0;
        for (const c of text) {
            if (c == "\t") {
                let k = Math.floor(column / 4) + 1;
                const stop = () =>
                    position.x +
                    size.x *
                        (k * StrokeFont.tab_pitch - StrokeFont.tab_stop_offset);
                while (stop() <= x) {
                    k++;
                }
                x = stop();
                column = 4 * k;
                continue;
            }

            const glyph = this.get_glyph(c);
            glyphs.push(
                glyph.transform(
                    glyph_size,
                    new Vec2(x, baseline),
                    tilt,
                    angle,
                    mirror,
                    origin,
                ),
            );
            x += glyph.bbox.w * glyph_size.x;
            column++;
        }

        return {
            bbox: new BBox(
                position.x,
                baseline - glyph_size.y,
                x - position.x,
                glyph_size.y,
            ),
            glyphs,
            cursor: new Vec2(x, position.y),
        };
    }
}

/**
 * Decodes a glyph in the encoding Newstroke's fontconv.awk writes (see
 * third_party/newstroke): each character is a coordinate, its code minus
 * that of "R", in font units. The first two give the left and right edges
 * of the advance box; then come (x, y) pairs with y offset by 9, with " R"
 * lifting the pen. Returns the glyph in em units, x from the left edge and
 * y down from the baseline.
 */
function decode_glyph(data: string): StrokeGlyph {
    const R = "R".charCodeAt(0);
    const unit = (i: number) => data.charCodeAt(i) - R;
    const em = StrokeFont.units_per_em;

    const left = unit(0);
    const right = unit(1);

    const strokes: Vec2[][] = [];
    let stroke: Vec2[] | null = null;
    for (let i = 2; i + 1 < data.length; i += 2) {
        if (data[i] == " " && data[i + 1] == "R") {
            stroke = null;
            continue;
        }
        if (!stroke) {
            stroke = [];
            strokes.push(stroke);
        }
        stroke.push(new Vec2((unit(i) - left) / em, (unit(i + 1) - 9) / em));
    }

    return new StrokeGlyph(strokes, new BBox(0, -1, (right - left) / em, 1));
}
