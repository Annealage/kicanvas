/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import type { Color } from "../../../base/color";
import { Angle, Vec2 } from "../../../base/math";
import type { Effects } from "../../../kicad/common";
import * as schematic_items from "../../../kicad/schematic";
import { LayerNames, ViewLayer } from "../layers";
import {
    SchematicItemPainter,
    text_box,
    text_pen,
    text_thickness,
    text_up,
    type TextPlacement,
} from "./base";

/*
 * Label geometry measured on kicad-cli 9 SVG exports: every shape of global
 * and hierarchical label and of netclass flag at each rotation, and, at
 * rotation 0, text sizes of 0.8-3mm with no thickness, (thickness 0.05),
 * (thickness 0.3) and (bold yes). Lengths below are in mm; s is the text
 * size and t the text thickness (see text_thickness()).
 */

/**
 * How a label at the given rotation lies on the page: its shape extends from
 * the label's position along `direction`; its text is upright, reading left
 * to right at rotations 0 and 180 and upwards at 90 and 270, and starts at
 * the position end for 0 and 90 and ends there for 180 and 270.
 */
export function label_frame(rotation: number): LabelFrame {
    const quarter = ((Math.round(rotation / 90) % 4) + 4) % 4;
    const angle = quarter % 2 == 0 ? 0 : 90;
    return {
        direction: new Vec2([1, 0, -1, 0][quarter]!, [0, -1, 0, 1][quarter]!),
        angle,
        up: text_up(angle),
        h_align: quarter < 2 ? "left" : "right",
    };
}

export type LabelFrame = {
    direction: Vec2;
    angle: number;
    up: Vec2;
    h_align: "left" | "right";
};

/** A label's outline and where its text goes, on the page. */
export type LabelGeometry = {
    outline: Vec2[];
    text: TextPlacement;
};

export type DirectiveLabelGeometry = {
    lines: Vec2[][];
    circles: { center: Vec2; radius: number; filled: boolean }[];
};

type LabelWithShape = schematic_items.Label & { shape: string };

/** Maps (along, across) in a label's frame onto the page. */
function frame_point(
    position: Vec2,
    frame: LabelFrame,
    along: number,
    across: number,
) {
    return position
        .add(frame.direction.multiply(along))
        .add(frame.up.multiply(across));
}

function label_color(effects: Effects, theme_color: Color) {
    const color = effects.font.color;
    return color.is_transparent_black ? theme_color : color;
}

/**
 * A local label is text only, raised 0.15s + t off the wire.
 */
export function local_label_text(label: schematic_items.Label): TextPlacement {
    const frame = label_frame(label.at.rotation);
    const s = label.effects.font.size.y;
    const raise = 0.15 * s + text_thickness(label.effects);
    return {
        position: label.at.position.add(frame.up.multiply(raise)),
        angle: frame.angle,
        h_align: frame.h_align,
        v_align: "bottom",
    };
}

/**
 * A hierarchical label's flag is s long and s across whatever its text, and
 * the text starts 1.15s from the position, centred on the wire.
 */
export function hierarchical_label_geometry(
    label: LabelWithShape,
): LabelGeometry {
    const frame = label_frame(label.at.rotation);
    const s = label.effects.font.size.y;
    const h = s / 2;

    let outline: [number, number][];
    switch (label.shape) {
        case "input":
            outline = [
                [0, 0],
                [h, h],
                [s, h],
                [s, -h],
                [h, -h],
                [0, 0],
            ];
            break;
        case "output":
            outline = [
                [s, 0],
                [h, h],
                [0, h],
                [0, -h],
                [h, -h],
                [s, 0],
            ];
            break;
        case "bidirectional":
        case "tri_state":
            outline = [
                [0, 0],
                [h, h],
                [s, 0],
                [h, -h],
                [0, 0],
            ];
            break;
        default:
            outline = [
                [0, h],
                [s, h],
                [s, -h],
                [0, -h],
                [0, h],
            ];
            break;
    }

    const at = label.at.position;
    return {
        outline: outline.map(([a, c]) => frame_point(at, frame, a, c)),
        text: {
            position: frame_point(at, frame, 1.15 * s, 0),
            angle: frame.angle,
            h_align: frame.h_align,
            v_align: "center",
        },
    };
}

/**
 * A global label's box is 0.875s + t either side of the wire. Input,
 * bidirectional and tri-state labels come to a point at the wire end, and
 * output, bidirectional and tri-state ones at the far end, 0.875s deep. The
 * text starts 0.375s in from a flat end or 1.125s in from a pointed one, sits
 * 0.0715s below the wire, and the flat part of the box runs on to
 * 0.75s + t + the width of the text's box (see text_box()), plus 0.875s
 * after a pointed start.
 */
export function global_label_geometry(label: LabelWithShape): LabelGeometry {
    const frame = label_frame(label.at.rotation);
    const s = label.effects.font.size.y;
    const t = text_thickness(label.effects);
    const box = text_box(label.shown_text, label.effects).size.x;

    const pointed_start = ["input", "bidirectional", "tri_state"].includes(
        label.shape,
    );
    const pointed_end = ["output", "bidirectional", "tri_state"].includes(
        label.shape,
    );
    const half = 0.875 * s + t;
    const point = 0.875 * s;
    const end = 0.75 * s + t + box + (pointed_start ? point : 0);
    const start = pointed_start ? point : 0;

    const outline: [number, number][] = [
        [0, 0],
        [start, half],
        [end, half],
        [pointed_end ? end + point : end, 0],
        [end, -half],
        [start, -half],
        [0, 0],
    ];

    const at = label.at.position;
    return {
        outline: outline.map(([a, c]) => frame_point(at, frame, a, c)),
        text: {
            position: frame_point(
                at,
                frame,
                (pointed_start ? 1.125 : 0.375) * s,
                -0.0715 * s,
            ),
            angle: frame.angle,
            h_align: frame.h_align,
            v_align: "center",
        },
    };
}

/**
 * A netclass flag is a stem of its (length) with a head on the end, drawn
 * upwards at rotation 0 and turned counterclockwise with the rotation. The
 * heads are a fixed size: a 0.3556 radius dot, a 0.508 radius circle, a
 * 2.032 x 1.016 diamond or a 1.6256 x 0.8128 rectangle, each centred on the
 * stem's end, with the stem stopping at the head.
 */
export function directive_label_geometry(
    label: schematic_items.DirectiveLabel,
): DirectiveLabelGeometry {
    const quarter = ((Math.round(label.at.rotation / 90) % 4) + 4) % 4;
    const direction = new Vec2(
        [0, -1, 0, 1][quarter]!,
        [-1, 0, 1, 0][quarter]!,
    );
    const across = new Vec2(-direction.y, direction.x);
    const at = (along: number, side: number) =>
        label.at.position
            .add(direction.multiply(along))
            .add(across.multiply(side));
    const length = label.length;

    const lines: DirectiveLabelGeometry["lines"] = [];
    const circles: DirectiveLabelGeometry["circles"] = [];

    switch (label.shape) {
        case "dot":
            lines.push([at(0, 0), at(length - 0.3556, 0)]);
            circles.push({
                center: at(length, 0),
                radius: 0.3556,
                filled: true,
            });
            break;
        case "round":
            lines.push([at(0, 0), at(length - 0.508, 0)]);
            circles.push({
                center: at(length, 0),
                radius: 0.508,
                filled: false,
            });
            break;
        case "diamond":
            lines.push([
                at(0, 0),
                at(length - 0.508, 0),
                at(length, 1.016),
                at(length + 0.508, 0),
                at(length, -1.016),
                at(length - 0.508, 0),
            ]);
            break;
        default:
            lines.push([
                at(0, 0),
                at(length - 0.4064, 0),
                at(length - 0.4064, 0.8128),
                at(length + 0.4064, 0.8128),
                at(length + 0.4064, -0.8128),
                at(length - 0.4064, -0.8128),
                at(length - 0.4064, 0),
            ]);
            break;
    }

    return { lines, circles };
}

abstract class LabelPainter extends SchematicItemPainter {
    override layers_for(item: schematic_items.Label) {
        return [LayerNames.label];
    }

    protected paint_label(
        label: schematic_items.Label,
        text: TextPlacement,
        theme_color: Color,
        outline?: Vec2[],
    ) {
        const color = label_color(label.effects, theme_color);

        if (outline) {
            this.gfx.line(outline, text_pen(label.effects), color);
        }

        if (label.shown_text) {
            this.draw_text(label.shown_text, label.effects, text, color);
        }
    }
}

export class NetLabelPainter extends LabelPainter {
    override classes = [schematic_items.NetLabel];

    override paint(layer: ViewLayer, l: schematic_items.NetLabel) {
        this.paint_label(l, local_label_text(l), this.theme.label_local);
    }
}

export class GlobalLabelPainter extends LabelPainter {
    override classes = [schematic_items.GlobalLabel];

    override paint(layer: ViewLayer, l: schematic_items.GlobalLabel) {
        const { outline, text } = global_label_geometry(l);
        this.paint_label(l, text, this.theme.label_global, outline);
    }
}

export class HierarchicalLabelPainter extends LabelPainter {
    override classes = [schematic_items.HierarchicalLabel];

    override paint(layer: ViewLayer, l: schematic_items.HierarchicalLabel) {
        const { outline, text } = hierarchical_label_geometry(l);
        this.paint_label(l, text, this.theme.label_hier, outline);
    }
}

export class DirectiveLabelPainter extends LabelPainter {
    override classes = [schematic_items.DirectiveLabel];

    override paint(layer: ViewLayer, l: schematic_items.DirectiveLabel) {
        const color = label_color(l.effects, this.theme.netclass_flag);
        const width = text_pen(l.effects);
        const { lines, circles } = directive_label_geometry(l);

        for (const points of lines) {
            this.gfx.line(points, width, color);
        }

        for (const { center, radius, filled } of circles) {
            if (filled) {
                this.gfx.circle(center, radius, color);
            } else {
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

        for (const property of l.properties) {
            this.view_painter.paint_item(layer, property);
        }
    }
}
