/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Vec2 } from "../../base/math";
import { At, Effects } from "../common";
import { Font, TextAttributes } from "./font";
import { StrokeFont } from "./stroke-font";

/**
 * A text item, schematic or board: its string, where it's anchored and how
 * it's drawn.
 *
 * Lengths are in internal units, 10000 to the millimetre.
 */
export class EDAText {
    constructor(text: string) {
        this.text = text;
    }

    /**
     * Takes the size, pen, style, justification and visibility parsed from a
     * file's (effects ...). The pen width stays 0 when the file gives none;
     * see get_effective_text_thickness().
     */
    apply_effects(effects: Effects) {
        const attributes = this.attributes;
        attributes.size = effects.font.size.multiply(10000);
        attributes.stroke_width = effects.font.thickness * 10000;
        attributes.bold = effects.font.bold;
        attributes.italic = effects.font.italic;
        attributes.color = effects.font.color;
        attributes.h_align = effects.justify.horizontal;
        attributes.v_align = effects.justify.vertical;
        attributes.mirrored = effects.justify.mirror;
        attributes.visible = !effects.hide;
    }

    /** Takes the position and rotation parsed from a file's (at ...). */
    apply_at(at: At) {
        this.text_pos = at.position.multiply(10000);
        this.text_angle = Angle.from_degrees(at.rotation);
    }

    /** The unprocessed text value, as it would be seen in save files */
    text: string;

    /** The processed text that will be used for rendering */
    get shown_text() {
        return this.text;
    }

    /**
     * The pen width KiCad uses for this text: the one it was given, or for
     * bold text a fifth of its width, or else `default_thickness`, which
     * defaults to an eighth of the width. Never more than a quarter of the
     * text's smaller dimension.
     *
     * Measured with kicad-cli 9: bold schematic text without a thickness is
     * drawn at 1/5 of its width; plain text without one is drawn with the
     * schematic's default line width but sized for its text box, and wrapped,
     * with 1/8 of its width.
     */
    get_effective_text_thickness(default_thickness?: number): number {
        let pen = this.text_thickness;
        if (pen <= 0) {
            pen = this.bold
                ? this.text_width / 5
                : (default_thickness ?? this.text_width / 8);
        }
        return Font.clamp_pen_width(pen, this.text_size);
    }

    /** Where the text is anchored. */
    text_pos: Vec2 = new Vec2(0, 0);

    attributes = new TextAttributes();

    get text_angle() {
        return this.attributes.angle;
    }

    set text_angle(a: Angle) {
        this.attributes.angle = a;
    }

    get italic() {
        return this.attributes.italic;
    }

    get bold() {
        return this.attributes.bold;
    }

    get visible() {
        return this.attributes.visible;
    }

    get mirrored() {
        return this.attributes.mirrored;
    }

    get multiline() {
        return this.attributes.multiline;
    }

    get h_align() {
        return this.attributes.h_align;
    }

    set h_align(v) {
        this.attributes.h_align = v;
    }

    get v_align() {
        return this.attributes.v_align;
    }

    set v_align(v) {
        this.attributes.v_align = v;
    }

    get line_spacing() {
        return this.attributes.line_spacing;
    }

    get text_size() {
        return this.attributes.size;
    }

    get text_width() {
        return this.attributes.size.x;
    }

    get text_height() {
        return this.attributes.size.y;
    }

    get text_color() {
        return this.attributes.color;
    }

    get keep_upright() {
        return this.attributes.keep_upright;
    }

    get text_thickness() {
        return this.attributes.stroke_width;
    }

    get font(): Font {
        return this.attributes.font ?? StrokeFont.default();
    }

    /**
     * Width and height of the box KiCad gives this text (see
     * Font.get_text_box_size()), sized with get_effective_text_thickness().
     */
    get text_box_size(): Vec2 {
        return this.font.get_text_box_size(
            this.shown_text,
            this.text_size,
            this.get_effective_text_thickness(),
            this.multiline,
            this.line_spacing,
        );
    }

    /**
     * The text's box, unrotated, placed on its anchor by its justification
     * (mirrored text extends the other way).
     */
    get_text_box(): BBox {
        return this.oriented_text_box(
            this.text_pos,
            new Vec2(this.mirrored ? -1 : 1, 0),
            new Vec2(0, 1),
        );
    }

    /**
     * The text box laid from `anchor` by the justification along `reading`
     * (the direction the text reads in) and `down` (from the tops of the
     * glyphs to their baseline), as an axis-aligned box.
     *
     * Italic text's box moves along the line by the slant of its height,
     * times 0, 1/2 or 1 for left, centre or right justification: kicad-cli 9
     * centres an italic 5 mm field 0, 0.3125 and 0.625 mm further along than
     * an upright one, in every symbol orientation.
     */
    protected oriented_text_box(anchor: Vec2, reading: Vec2, down: Vec2) {
        const size = this.text_box_size;
        const slant = this.italic ? Font.italic_tilt * this.text_height : 0;
        const along = {
            left: [0, size.x],
            center: [(slant - size.x) / 2, (slant + size.x) / 2],
            right: [slant - size.x, slant],
        }[this.h_align];
        const across = {
            top: [0, size.y],
            center: [-size.y / 2, size.y / 2],
            bottom: [-size.y, 0],
        }[this.v_align];
        return BBox.from_points(
            along.flatMap((u) =>
                across.map((v) =>
                    anchor.add(reading.multiply(u!)).add(down.multiply(v!)),
                ),
            ),
        );
    }
}
