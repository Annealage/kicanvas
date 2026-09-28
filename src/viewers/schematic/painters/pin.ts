/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, Vec2 } from "../../../base/math";
import * as schematic_items from "../../../kicad/schematic";
import { LayerNames, ViewLayer } from "../layers";
import {
    SchematicItemPainter,
    text_direction,
    text_up,
    type TextPlacement,
} from "./base";
import type { SymbolTransform } from "./symbol";

/*
 * Pin geometry measured on kicad-cli 9 SVG exports of symbols with pins of
 * every graphic style and electrical type, pointing each way, at every symbol
 * rotation and mirror, with name and number sizes of 0.5-2.54mm, pin lengths
 * of 0.635-5.08mm and (pin_names (offset 0|0.508|1.27)) or no offset.
 *
 * Everything is laid out on the page after the symbol's transform: pin text
 * is always upright, and the side a pin's decorations sit on ("above" the
 * pin) is the page's top for a horizontal pin and its left for a vertical
 * one, whatever the symbol's rotation or mirror.
 */

/**
 * Radius of the inversion bubble; the clock wedge, the active-low marks and
 * the non-logic cross are all sized in multiples of it. It does not scale with
 * the pin's length or text size.
 */
const DECORATION = 0.635;

/** Half the size of the X drawn on a no_connect pin's connection point. */
const NO_CONNECT_MARK = 0.381;

/** Gap between a pin's line and a name or number written beside it. */
const TEXT_MARGIN = 0.254;

/** A pin placed on the page, in mm. */
export type PlacedPin = {
    /** Where wires connect. */
    connection: Vec2;
    /** Unit vector from the connection point towards the symbol body. */
    direction: Vec2;
    length: number;
};

export type PinGraphics = {
    lines: Vec2[][];
    circles: { center: Vec2; radius: number }[];
};

/** Places a library pin on the page with its symbol's transform. */
export function place_pin(
    def: schematic_items.PinDefinition,
    transform: SymbolTransform,
): PlacedPin {
    const quarter = ((Math.round(def.at.rotation / 90) % 4) + 4) % 4;
    const lib_direction = new Vec2(
        [1, 0, -1, 0][quarter]!,
        [0, 1, 0, -1][quarter]!,
    );
    return {
        connection: transform.position.add(
            transform.matrix.transform(def.at.position),
        ),
        direction: transform.matrix.transform(lib_direction),
        length: def.length,
    };
}

/** Page angle (0 or 90) that text along a pin is written at. */
function pin_text_angle(pin: PlacedPin) {
    return Math.abs(pin.direction.x) >= Math.abs(pin.direction.y) ? 0 : 90;
}

/**
 * The strokes of a pin: its line, its graphic style and the no-connect mark.
 */
export function pin_graphics(
    pin: PlacedPin,
    shape: schematic_items.PinShape,
    type: schematic_items.PinElectricalType,
): PinGraphics {
    const u = pin.direction;
    const above = text_up(pin_text_angle(pin));
    const root = pin.connection.add(u.multiply(pin.length));
    const at = (along: number, across: number) =>
        root.add(u.multiply(along)).add(above.multiply(across));
    const d = DECORATION;

    const lines: Vec2[][] = [];
    const circles: PinGraphics["circles"] = [];

    // The bubble and the external falling-edge wedge take the last 2d of the
    // pin, so the line stops short of the body.
    const shortened =
        shape == "inverted" ||
        shape == "inverted_clock" ||
        shape == "edge_clock_high";
    lines.push([pin.connection, at(shortened ? -2 * d : 0, 0)]);

    if (shape == "inverted" || shape == "inverted_clock") {
        circles.push({ center: at(-d, 0), radius: d });
    }
    if (shape == "clock" || shape == "inverted_clock" || shape == "clock_low") {
        lines.push([at(0, d), at(2 * d, 0), at(0, -d)]);
    }
    if (shape == "input_low" || shape == "clock_low") {
        lines.push([at(-2 * d, 0), at(-2 * d, 2 * d), at(0, 0)]);
    }
    if (shape == "output_low") {
        lines.push([at(0, 2 * d), at(-2 * d, 0)]);
    }
    if (shape == "edge_clock_high") {
        lines.push([at(0, d), at(-2 * d, 0), at(0, -d)]);
    }
    if (shape == "non_logic") {
        lines.push([at(-d, -d), at(d, d)]);
        lines.push([at(-d, d), at(d, -d)]);
    }

    if (type == "no_connect") {
        const c = pin.connection;
        const m = NO_CONNECT_MARK;
        lines.push([c.add(new Vec2(-m, -m)), c.add(new Vec2(m, m))]);
        lines.push([c.add(new Vec2(m, -m)), c.add(new Vec2(-m, m))]);
    }

    return { lines, circles };
}

/**
 * Where a pin's name and number are written. With a positive name offset
 * the name sits inside the body, that far past the pin's end and centred on
 * its line, and the number is centred above the pin. With no offset the name
 * goes above the pin and the number below it.
 */
export function pin_text_placements(
    pin: PlacedPin,
    name_offset: number,
): { name: TextPlacement; number: TextPlacement } {
    const angle = pin_text_angle(pin);
    const above = text_up(angle).multiply(TEXT_MARGIN);
    const middle = pin.connection.add(pin.direction.multiply(pin.length / 2));

    const beside = (side: Vec2, v_align: "top" | "bottom"): TextPlacement => ({
        position: middle.add(side),
        angle,
        h_align: "center",
        v_align,
    });

    if (name_offset > 0) {
        const reading = text_direction(angle);
        const reads_inwards =
            pin.direction.x * reading.x + pin.direction.y * reading.y > 0
                ? "left"
                : "right";
        return {
            name: {
                position: pin.connection.add(
                    pin.direction.multiply(pin.length + name_offset),
                ),
                angle,
                h_align: reads_inwards,
                v_align: "center",
            },
            number: beside(above, "bottom"),
        };
    }

    return {
        name: beside(above, "bottom"),
        number: beside(above.multiply(-1), "top"),
    };
}

export class PinPainter extends SchematicItemPainter {
    override classes = [schematic_items.PinInstance];

    override layers_for(item: schematic_items.PinInstance) {
        return [
            LayerNames.symbol_pin,
            LayerNames.symbol_foreground,
            LayerNames.interactive,
        ];
    }

    override paint(layer: ViewLayer, pin: schematic_items.PinInstance) {
        const transform = this.view_painter.current_symbol_transform;
        const def = pin.definition;

        if (!transform || def.hide) {
            return;
        }

        const alternate = pin.alternate
            ? def.alternates?.find((alt) => alt.name == pin.alternate)
            : undefined;
        const placed = place_pin(def, transform);

        if (
            layer.name == LayerNames.symbol_pin ||
            layer.name == LayerNames.interactive
        ) {
            this.#paint_graphics(
                placed,
                alternate?.shape ?? def.shape,
                alternate?.type ?? def.type,
            );
        }

        if (layer.name == LayerNames.symbol_foreground) {
            this.#paint_text(
                placed,
                def,
                alternate?.name ?? def.name.text,
                pin.parent.lib_symbol,
            );
        }
    }

    #paint_graphics(
        placed: PlacedPin,
        shape: schematic_items.PinShape,
        type: schematic_items.PinElectricalType,
    ) {
        const color = this.dim_if_needed(this.theme.pin);
        const width = schematic_items.DefaultValues.line_width;
        const { lines, circles } = pin_graphics(placed, shape, type);

        for (const points of lines) {
            this.gfx.line(points, width, color);
        }
        for (const { center, radius } of circles) {
            this.gfx.arc(
                center,
                radius,
                new Angle(0),
                new Angle(Math.PI * 2),
                width,
                color,
            );
        }
    }

    #paint_text(
        placed: PlacedPin,
        def: schematic_items.PinDefinition,
        name: string,
        lib_symbol: schematic_items.LibSymbol,
    ) {
        const placements = pin_text_placements(
            placed,
            lib_symbol.pin_names.offset,
        );

        // A name of "~" means the pin has no name.
        if (!lib_symbol.pin_names.hide && name && name != "~") {
            this.draw_text(
                name,
                def.name.effects,
                placements.name,
                this.dim_if_needed(this.theme.pin_name),
            );
        }

        if (!lib_symbol.pin_numbers.hide && def.number.text) {
            this.draw_text(
                def.number.text,
                def.number.effects,
                placements.number,
                this.dim_if_needed(this.theme.pin_number),
            );
        }
    }
}
