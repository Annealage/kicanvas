/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { BBox, Matrix3, Vec2 } from "../../../base/math";
import { NullRenderer } from "../../../graphics/null-renderer";
import type { SchematicTheme } from "../../../kicad";
import * as schematic_items from "../../../kicad/schematic";
import { LayerNames, LayerSet, ViewLayer } from "../layers";
import { SchematicPainter } from "../painter";
import { SchematicItemPainter } from "./base";

export class LibSymbolPainter extends SchematicItemPainter {
    classes = [schematic_items.LibSymbol];

    layers_for(item: schematic_items.LibSymbol) {
        return [
            LayerNames.symbol_background,
            LayerNames.symbol_foreground,
            LayerNames.symbol_field,
        ];
    }

    paint(layer: ViewLayer, s: schematic_items.LibSymbol, body_style = 1) {
        if (
            ![
                LayerNames.symbol_background,
                LayerNames.symbol_foreground,
                LayerNames.interactive,
            ].includes(layer.name as LayerNames)
        ) {
            return;
        }

        // Unit 0 holds the graphics every unit shares: a symbol unit
        // identifier "NAME_UNIT_STYLE" with UNIT 0 is common to all units
        // (KiCad file-format documentation, "Symbol Unit Identifier").
        const common_unit = s.units.get(0);
        if (common_unit) {
            this.#paint_unit(layer, common_unit, body_style);
        }

        const si = this.view_painter.current_symbol;

        const symbol_unit = s.units.get(si?.unit || 1);

        if (symbol_unit) {
            this.#paint_unit(layer, symbol_unit, body_style);
        }
    }

    #paint_unit(
        layer: ViewLayer,
        unit: schematic_items.LibSymbol[],
        body_style = 1,
    ) {
        for (const sym of unit) {
            if (sym.style > 0 && body_style != sym.style) {
                continue;
            }

            for (const g of sym.drawings) {
                this.view_painter.paint_item(layer, g);
            }
        }
    }
}

export class SchematicSymbolPainter extends SchematicItemPainter {
    classes = [schematic_items.SchematicSymbol];

    layers_for(item: schematic_items.SchematicSymbol) {
        const layers = [
            LayerNames.interactive,
            LayerNames.symbol_foreground,
            LayerNames.symbol_background,
            LayerNames.symbol_field,
            LayerNames.symbol_pin,
        ];

        if (item.dnp) {
            layers.push(LayerNames.marks);
        }

        return layers;
    }

    paint(layer: ViewLayer, si: schematic_items.SchematicSymbol) {
        if (layer.name == LayerNames.interactive && si.lib_symbol.power) {
            // Don't draw power symbols on the interactive layer.
            return;
        }

        const transform = get_symbol_transform(si);

        this.view_painter.current_symbol = si;
        this.view_painter.current_symbol_transform = transform;

        this.gfx.state.push();
        this.gfx.state.matrix = Matrix3.translation(
            si.at.position.x,
            si.at.position.y,
        );
        this.gfx.state.multiply(transform.matrix);

        const body_style = si.convert ?? 1;

        this.view_painter.paint_item(layer, si.lib_symbol, body_style);

        this.gfx.state.pop();

        if (
            [
                LayerNames.symbol_pin,
                LayerNames.symbol_foreground,
                LayerNames.interactive,
            ].includes(layer.name as LayerNames)
        ) {
            for (const pin of si.unit_pins) {
                this.view_painter.paint_item(layer, pin);
            }
        }

        if (
            layer.name == LayerNames.symbol_field ||
            layer.name == LayerNames.interactive
        ) {
            for (const [_, p] of si.properties) {
                this.view_painter.paint_item(layer, p);
            }
        }

        if (si.dnp && layer.name == LayerNames.marks) {
            const bbox = get_symbol_body_and_pins_bbox(this.theme, si);
            // kicad-cli draws the DNP cross three default line widths wide.
            const width = schematic_items.DefaultValues.line_width * 3;
            const color = this.theme.erc_error;

            this.gfx.line([bbox.top_left, bbox.bottom_right], width, color);
            this.gfx.line([bbox.bottom_left, bbox.top_right], width, color);
        }

        this.view_painter.current_symbol = undefined;
        this.view_painter.current_symbol_transform = undefined;
    }
}

export type SymbolTransform = {
    /**
     * Maps library coordinates (y up) to page offsets (y down) from the
     * symbol's position.
     */
    matrix: Matrix3;
    position: Vec2;
    /** Quarter turns counterclockwise on the page, 0 to 3. */
    rotations: number;
    mirror_x: boolean;
    mirror_y: boolean;
};

/**
 * Places a symbol instance. Measured with kicad-cli 9 on an asymmetric symbol
 * at every (at x y r) and (mirror x|y): the library drawing (y up) is put on
 * the page (y down), turned counterclockwise on screen by r, and then
 * mirrored, (mirror x) top to bottom and (mirror y) left to right.
 */
export function get_symbol_transform(
    symbol: schematic_items.SchematicSymbol,
): SymbolTransform {
    const rotations = ((Math.round(symbol.at.rotation / 90) % 4) + 4) % 4;
    const cos = [1, 0, -1, 0][rotations]!;
    const sin = [0, 1, 0, -1][rotations]!;
    const mirror_x = symbol.mirror == "x";
    const mirror_y = symbol.mirror == "y";
    const sx = mirror_y ? -1 : 1;
    const sy = mirror_x ? -1 : 1;

    // page x = sx * (x cos - y sin), page y = -sy * (x sin + y cos)
    // prettier-ignore
    const matrix = new Matrix3([
        sx * cos, -sy * sin, 0,
        -sx * sin, -sy * cos, 0,
        0, 0, 1,
    ]);

    return {
        matrix,
        position: symbol.at.position,
        rotations,
        mirror_x,
        mirror_y,
    };
}

/**
 * Determines the bounding box for the given symbol, including only the body
 * and the pins, not any fields or text items.
 */
function get_symbol_body_and_pins_bbox(
    theme: SchematicTheme,
    si: schematic_items.SchematicSymbol,
): BBox {
    const gfx = new NullRenderer();
    const layerset = new LayerSet(theme);
    const painter = new SchematicPainter(gfx, layerset, theme);

    const layer_names = [
        LayerNames.symbol_foreground,
        LayerNames.symbol_background,
        LayerNames.symbol_pin,
    ];

    const bboxes = [];

    for (const layer_name of layer_names) {
        const layer = layerset.by_name(layer_name)!;
        layer.items.push(si);
        painter.paint_layer(layer);
        bboxes.push(layer.bbox);
    }

    return BBox.combine(bboxes);
}
