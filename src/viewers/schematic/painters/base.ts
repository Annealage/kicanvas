/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import type { Color } from "../../../base/color";
import { Angle, Vec2 } from "../../../base/math";
import type { SchematicTheme } from "../../../kicad";
import type { Effects } from "../../../kicad/common";
import * as schematic_items from "../../../kicad/schematic";
import {
    EDAText,
    Font,
    StrokeFont,
    TextAttributes,
    type HAlign,
    type VAlign,
} from "../../../kicad/text";
import { DocumentPainter, ItemPainter } from "../../base/painter";
import { LayerNames, type ViewLayer } from "../layers";
import type { SchematicPainter } from "../painter";
import type { SymbolTransform } from "./symbol";

/*
 * Text metrics for schematic text, in mm, measured on kicad-cli 9 SVG exports
 * of labels and fields over sizes 0.8-3mm with no thickness, (thickness 0.05),
 * (thickness 0.3) and (bold yes).
 *
 * Layout uses the text's thickness: an explicit (thickness) capped at a
 * quarter of the size, size/5 for bold text and size/8 otherwise. The strokes
 * are drawn with the same width, except that text with no explicit thickness
 * is drawn at the default line width whatever its size, and that no text is
 * drawn thinner than 0.0847mm ((thickness 0.05) is drawn at 0.0847).
 */

/** The stroke width KiCad lays text out with. */
export function text_thickness(effects: Effects): number {
    const { size, thickness, bold } = effects.font;
    if (thickness > 0) {
        return Math.min(thickness, Math.min(size.x, size.y) / 4);
    }
    return bold ? size.x / 5 : size.x / 8;
}

/** The stroke width KiCad draws text with. */
export function text_pen(effects: Effects): number {
    const { size, thickness, bold } = effects.font;
    if (thickness > 0) {
        return Math.max(
            Math.min(thickness, Math.min(size.x, size.y) / 4),
            0.0847,
        );
    }
    return bold ? size.x / 5 : schematic_items.DefaultValues.line_width;
}

/**
 * The box KiCad fits a line of text in (text/eda-text.ts's text_box_size),
 * in mm, and how far italic text's box leans over its height.
 */
export function text_box(text: string, effects: Effects) {
    const eda = new EDAText(text);
    eda.apply_effects(effects);
    return {
        size: eda.text_box_size.multiply(1 / 10000),
        slant: effects.font.italic ? Font.italic_tilt * effects.font.size.y : 0,
    };
}

/** Where and how a text item is anchored, in page coordinates (mm). */
export type TextPlacement = {
    position: Vec2;
    /** 0 for text reading left to right, 90 for text reading upwards. */
    angle: number;
    h_align: HAlign;
    v_align: VAlign;
};

/** Reading direction of text at a page angle of 0 or 90 degrees. */
export function text_direction(angle: number): Vec2 {
    return angle == 90 ? new Vec2(0, -1) : new Vec2(1, 0);
}

/** Direction of the top of text at a page angle of 0 or 90 degrees. */
export function text_up(angle: number): Vec2 {
    return angle == 90 ? new Vec2(-1, 0) : new Vec2(0, -1);
}

export abstract class BaseSchematicPainter extends DocumentPainter {
    override theme: SchematicTheme;
    current_symbol?: schematic_items.SchematicSymbol;
    current_symbol_transform?: SymbolTransform;
}

export abstract class SchematicItemPainter extends ItemPainter {
    override view_painter: SchematicPainter;

    override get theme(): SchematicTheme {
        return this.view_painter.theme;
    }

    protected get is_dimmed() {
        return this.view_painter.current_symbol?.dnp ?? false;
    }

    protected dim_color(color: Color) {
        // kicad-cli draws a DNP symbol's colours as the grey of the colour's
        // HSL lightness mixed half and half with the background: measured on
        // #840000, #006464, #A90000 and #FFFFC2 over #F5F4EF.
        return color.desaturate().mix(this.theme.background, 0.5);
    }

    protected dim_if_needed(color: Color) {
        return this.is_dimmed ? this.dim_color(color) : color;
    }

    protected determine_stroke(
        layer: ViewLayer,
        item: schematic_items.GraphicItem,
    ) {
        const width = item.stroke?.width || this.gfx.state.stroke_width;

        if (width < 0) {
            return { width: 0, color: null };
        }

        const stroke_type = item.stroke?.type ?? "none";

        if (stroke_type == "none") {
            return { width: 0, color: null };
        }

        const default_stroke =
            layer.name == LayerNames.symbol_foreground
                ? this.theme.component_outline
                : this.theme.note;

        const color = this.dim_if_needed(item.stroke?.color ?? default_stroke);

        return { width, color };
    }

    protected determine_fill(
        layer: ViewLayer,
        item: schematic_items.GraphicItem,
    ) {
        const fill_type = item.fill?.type ?? "none";

        if (fill_type == "none") {
            return null;
        }

        if (
            fill_type == "background" &&
            layer.name != LayerNames.symbol_background
        ) {
            return null;
        }

        let color;

        switch (fill_type) {
            case "background":
                color = this.theme.component_body;
                break;
            case "outline":
                color = this.theme.component_outline;
                break;
            case "color":
                color = item.fill!.color;
                break;
        }

        return this.dim_if_needed(color);
    }

    /** Draws a line of text anchored as KiCad anchors it. */
    protected draw_text(
        text: string,
        effects: Effects,
        placement: TextPlacement,
        color: Color,
    ) {
        const attributes = new TextAttributes();
        attributes.size = effects.font.size.multiply(10000);
        attributes.stroke_width = text_pen(effects) * 10000;
        attributes.bold = effects.font.bold;
        attributes.italic = effects.font.italic;
        attributes.angle = Angle.from_degrees(placement.angle);
        attributes.h_align = placement.h_align;
        attributes.v_align = placement.v_align;
        attributes.color = color;

        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            text,
            placement.position.multiply(10000),
            attributes,
        );
        this.gfx.state.pop();
    }
}
