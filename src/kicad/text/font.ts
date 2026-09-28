/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Vec2 } from "../../base/math";
import { Color, Renderer } from "../../graphics";
import { Glyph, StrokeGlyph } from "./glyph";
import { Markup, MarkupNode } from "./markup";

/** Where a run of text sits: on the line, or as a subscript or superscript. */
export type Script = "none" | "subscript" | "superscript";

/** One line of marked-up text laid out along its baseline. */
export interface LineLayout {
    /** Glyphs in line space: x from the start of the line, y down from its baseline. */
    glyphs: Glyph[];
    /** Overbars as x ranges in line space; see Font.compute_overbar_vertical_position(). */
    overbars: [number, number][];
    /** The line's advance width. */
    width: number;
    /** Width of the size the last glyph was drawn at, or 0 for an empty line. */
    last_glyph_width: number;
    /** The script of each run of text, in order. */
    scripts: Script[];
}

/**
 * Lays out and draws text: lines, markup, justification, rotation and
 * mirroring. Subclasses supply the glyphs and the metrics.
 *
 * Lengths are in internal units, 10000 to the millimetre; draw() hands the
 * renderer millimetres.
 */
export abstract class Font {
    /**
     * Italic slant, as x shift per unit of height: kicad-cli 9 draws an
     * italic "H" 21 mm tall with its stems leaning 2.625 mm.
     */
    static readonly italic_tilt = 1 / 8;

    /**
     * The widest pen KiCad draws text with, as a fraction of the smaller of
     * the text's width and height: kicad-cli 9 draws a 0.3 mm pen on 1 mm
     * text at 0.25 mm, in both the PCB and schematic editors, bold or not.
     */
    static readonly max_pen_ratio = 0.25;

    constructor(public name: string) {}

    static clamp_pen_width(pen_width: number, size: Vec2) {
        return Math.min(
            pen_width,
            Font.max_pen_ratio * Math.min(size.x, size.y),
        );
    }

    /** The glyph for a character, or the font's stand-in if it has none. */
    abstract get_glyph(c: string): Glyph;

    /** Distance between the baselines of consecutive lines. */
    abstract get_interline(glyph_height: number, line_spacing?: number): number;

    /** How far above the baseline overbars are drawn. */
    abstract compute_overbar_vertical_position(glyph_height: number): number;

    /**
     * Where the first line's baseline sits, measured down from the anchor,
     * for a block of `line_count` lines.
     */
    abstract get_first_baseline(
        v_align: VAlign,
        line_count: number,
        glyph_height: number,
        pen_width: number,
        line_spacing?: number,
    ): number;

    /**
     * How far left- and right-justified text keeps from its anchor along the
     * line.
     */
    abstract get_justification_margin(pen_width: number): number;

    /** How far an overbar stops short of each end of what it covers. */
    abstract get_overbar_inset(glyph_width: number): number;

    /**
     * Width and height of the box KiCad gives a block of text, which it uses
     * to place fields and label shapes.
     */
    abstract get_text_box_size(
        text: string,
        size: Vec2,
        pen_width: number,
        multiline: boolean,
        line_spacing?: number,
    ): Vec2;

    /**
     * Lays out a run of plain text (no markup) on a baseline.
     *
     * @param size - the text's size; the style scales it for subscripts and
     *               superscripts.
     * @param position - where the run starts, on the line's baseline.
     * @param angle - rotation about `origin`, counter-clockwise on screen.
     * @param mirror - whether to reflect about `origin`.
     * @returns the placed glyphs, the run's advance box and the pen position
     *          after the run, both before rotation and mirroring.
     */
    abstract get_text_as_glyphs(
        text: string,
        size: Vec2,
        position: Vec2,
        angle: Angle,
        mirror: boolean,
        origin: Vec2,
        style: TextStyle,
    ): { bbox: BBox; glyphs: Glyph[]; cursor: Vec2 };

    /**
     * Lays out a line of marked-up text from x = 0 on a baseline at y = 0.
     */
    layout_line(text: string, size: Vec2, italic: boolean): LineLayout {
        const layout: LineLayout = {
            glyphs: [],
            overbars: [],
            width: 0,
            last_glyph_width: 0,
            scripts: [],
        };
        const origin = new Vec2(0, 0);
        const no_rotation = new Angle(0);

        const visit = (node: MarkupNode, style: TextStyle) => {
            if (node.text) {
                const run = this.get_text_as_glyphs(
                    node.text,
                    size,
                    new Vec2(layout.width, 0),
                    no_rotation,
                    false,
                    origin,
                    style,
                );
                layout.glyphs.push(...run.glyphs);
                layout.width = run.cursor.x;
                layout.scripts.push(
                    style.subscript
                        ? "subscript"
                        : style.superscript
                          ? "superscript"
                          : "none",
                );
                // A run's box is as tall as its glyphs, which subscripts and
                // superscripts scale in both directions.
                if (run.glyphs.length) {
                    layout.last_glyph_width = (size.x * run.bbox.h) / size.y;
                }
                return;
            }

            const inner = style.copy();
            inner.subscript ||= node.subscript;
            inner.superscript ||= node.superscript;

            const start = layout.width;
            for (const child of node.children) {
                visit(child, inner);
            }

            if (node.overbar && layout.width > start) {
                const inset = this.get_overbar_inset(size.x);
                layout.overbars.push([start + inset, layout.width - inset]);
            }
        };

        visit(new Markup(text).root, new TextStyle(false, italic));
        return layout;
    }

    /**
     * Draws text, which may span several lines and contain markup, with its
     * justification, rotation and mirroring taken from `attributes`.
     */
    draw(
        gfx: Renderer | null,
        text: string,
        position: Vec2,
        attributes: TextAttributes,
    ): void {
        if (!gfx || !text) {
            return;
        }

        const size = attributes.size;
        const pen = Font.clamp_pen_width(attributes.stroke_width, size);
        const lines = attributes.multiline ? text.split("\n") : [text];
        const interline = this.get_interline(size.y, attributes.line_spacing);
        const first_baseline = this.get_first_baseline(
            attributes.v_align,
            lines.length,
            size.y,
            pen,
            attributes.line_spacing,
        );
        const margin = this.get_justification_margin(pen);
        const overbar_y = -this.compute_overbar_vertical_position(size.y);

        const cos = Math.cos(attributes.angle.radians);
        const sin = Math.sin(attributes.angle.radians);
        const mirror = attributes.mirrored ? -1 : 1;

        // Text space (x along the line, y down from the anchor) to the
        // renderer's millimetres.
        const place = (x: number, y: number) => {
            x *= mirror;
            return new Vec2(
                (position.x + x * cos + y * sin) / 10000,
                (position.y - x * sin + y * cos) / 10000,
            );
        };

        lines.forEach((line, i) => {
            const layout = this.layout_line(line, size, attributes.italic);
            const baseline = first_baseline + i * interline;

            let start: number;
            switch (attributes.h_align) {
                case "left":
                    start = margin;
                    break;
                case "center":
                    start = -layout.width / 2;
                    break;
                case "right":
                    start = -layout.width - margin;
                    break;
            }

            for (const glyph of layout.glyphs) {
                for (const stroke of (glyph as StrokeGlyph).strokes) {
                    gfx.line(
                        stroke.map((p) => place(start + p.x, baseline + p.y)),
                        pen / 10000,
                        attributes.color,
                    );
                }
            }

            for (const [x0, x1] of layout.overbars) {
                gfx.line(
                    [
                        place(start + x0, baseline + overbar_y),
                        place(start + x1, baseline + overbar_y),
                    ],
                    pen / 10000,
                    attributes.color,
                );
            }
        });
    }

    /**
     * The extents of a single line of marked-up text drawn with a pen of
     * `thickness`: its advance width and glyph height, each grown by the pen.
     * With a thickness of 0 the width is the pure advance width.
     *
     * Boldness and slant change neither: stroke fonts are made bold by the
     * pen alone, and KiCad lays italics out on the same advances.
     */
    get_line_extents(
        text: string,
        size: Vec2,
        thickness: number,
        bold: boolean,
        italic: boolean,
    ): Vec2 {
        const layout = this.layout_line(text, size, italic);
        return new Vec2(layout.width + thickness, size.y + thickness);
    }

    /**
     * Wraps marked-up text to a column, as KiCad wraps the text in text boxes:
     * greedily, breaking only at spaces outside markup, with a line fitting
     * while its extents (see get_line_extents()) are within `column_width`.
     * A word wider than the column gets a line of its own; existing line
     * breaks are kept.
     *
     * Measured with kicad-cli 9 on schematic text boxes: a line fits exactly
     * when its advance width plus the pen width reaches the column width
     * (box width less margins), and runs of spaces break into empty lines.
     */
    break_lines(
        text: string,
        column_width: number,
        glyph_size: Vec2,
        thickness: number,
        bold: boolean,
        italic: boolean,
    ): string {
        const out: string[] = [];
        for (const paragraph of text.split("\n")) {
            const words = split_words(paragraph);
            let line = words[0]!;
            for (const word of words.slice(1)) {
                const joined = `${line} ${word}`;
                const extents = this.get_line_extents(
                    joined,
                    glyph_size,
                    thickness,
                    bold,
                    italic,
                );
                if (extents.x <= column_width) {
                    line = joined;
                } else {
                    out.push(line);
                    line = word;
                }
            }
            out.push(line);
        }
        return out.join("\n");
    }
}

/**
 * Splits text at spaces, except inside markup, which KiCad keeps whole. Runs
 * of spaces give empty words.
 */
function split_words(text: string): string[] {
    const words: string[] = [];
    let word = "";
    for (const node of new Markup(text).root.children) {
        if (!node.text) {
            word += node_source(node);
            continue;
        }
        const parts = node.text.split(" ");
        word += parts[0]!;
        for (const part of parts.slice(1)) {
            words.push(word);
            word = part;
        }
    }
    words.push(word);
    return words;
}

/** Reconstructs the markup a node was parsed from. */
function node_source(node: MarkupNode): string {
    if (node.text) {
        return node.text;
    }
    const inner = node.children.map(node_source).join("");
    const prefix = node.subscript ? "_" : node.superscript ? "^" : "~";
    return `${prefix}{${inner}}`;
}

export class TextStyle {
    constructor(
        public bold = false,
        public italic = false,
        public subscript = false,
        public superscript = false,
    ) {}

    copy() {
        return new TextStyle(
            this.bold,
            this.italic,
            this.subscript,
            this.superscript,
        );
    }
}

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "center" | "bottom";

export class TextAttributes {
    font: Font | null = null;
    h_align: HAlign = "center";
    v_align: VAlign = "center";
    angle: Angle = new Angle(0);
    line_spacing = 1;
    stroke_width = 0;
    italic = false;
    bold = false;
    color: Color = Color.transparent_black;
    visible = true;
    mirrored = false;
    multiline = true;
    size: Vec2 = new Vec2(0, 0);

    /** Used to keep the text from being rotated upside-down
     * or backwards and becoming difficult to read. */
    keep_upright = false;

    copy() {
        const a = new TextAttributes();
        a.font = this.font;
        a.h_align = this.h_align;
        a.v_align = this.v_align;
        a.angle = this.angle.copy();
        a.line_spacing = this.line_spacing;
        a.stroke_width = this.stroke_width;
        a.italic = this.italic;
        a.bold = this.bold;
        a.color = this.color.copy();
        a.visible = this.visible;
        a.mirrored = this.mirrored;
        a.multiline = this.multiline;
        a.size = this.size.copy();
        a.keep_upright = this.keep_upright;
        return a;
    }
}
