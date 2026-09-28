/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * Painters for drawing board items.
 *
 * Each item class has a corresponding Painter implementation.
 */

import { Angle, Arc, BBox, Matrix3, Vec2 } from "../../base/math";
import * as log from "../../base/log";
import { Circle, Color, Polygon, Polyline, Renderer } from "../../graphics";
import { StrokeParams } from "../../kicad/common.ts";
import * as board_items from "../../kicad/board";
import { EDAText, StrokeFont, StrokeGlyph } from "../../kicad/text";
import { DocumentPainter, ItemPainter, StrokePainter } from "../base/painter";
import { ViewLayerNames } from "../base/view-layers";
import {
    CopperVirtualLayerNames,
    CopperLayerNames,
    LayerNames,
    LayerSet,
    ViewLayer,
    copper_layers_between,
    virtual_layer_for,
    is_manufacturing_layer,
} from "./layers";
import type { BoardTheme } from "../../kicad";

abstract class BoardItemPainter extends ItemPainter {
    override view_painter: BoardPainter;

    override get theme(): BoardTheme {
        return this.view_painter.theme;
    }

    /** Alias for BoardPainter.filter_net */
    get filter_net(): number | null {
        return (this.view_painter as BoardPainter).filter_net;
    }

    protected isFillValid(fill: string): boolean {
        return Boolean(fill && fill !== "none" && fill !== "no");
    }
}

abstract class GraphicItemPainter extends BoardItemPainter {
    protected styled_line(
        lines: Vec2[],
        width: number,
        color: Color,
        stroke_style: StrokeParams,
    ) {
        const draw_line = (lines: Vec2[]) => {
            this.gfx.line(lines, width, color);
        };

        StrokePainter.line(lines, width, stroke_style, draw_line);
    }
}

class LinePainter extends GraphicItemPainter {
    classes = [board_items.GrLine, board_items.FpLine];

    layers_for(item: board_items.GrLine | board_items.FpLine) {
        return [item.layer];
    }

    paint(layer: ViewLayer, s: board_items.GrLine | board_items.FpLine) {
        if (this.filter_net) return;

        const points = [s.start, s.end];
        this.styled_line(points, s.width, layer.color, s.stroke_params);
    }
}

class RectPainter extends GraphicItemPainter {
    classes = [board_items.GrRect, board_items.FpRect];

    layers_for(item: board_items.GrRect | board_items.FpRect) {
        return [item.layer];
    }

    paint(layer: ViewLayer, r: board_items.GrRect | board_items.FpRect) {
        if (this.filter_net) return;

        const color = layer.color;

        // start, along x, end, back along x: the order kicad-cli 9's board
        // SVG walks a rectangle in, which sets where each side's dashes fall.
        const points = [
            r.start,
            new Vec2(r.end.x, r.start.y),
            r.end,
            new Vec2(r.start.x, r.end.y),
            r.start,
        ];

        this.styled_line(points, r.width, color, r.stroke_params);

        if (this.isFillValid(r.fill)) {
            this.gfx.polygon(new Polygon(points, color));
        }
    }
}

class PolyPainter extends GraphicItemPainter {
    classes = [board_items.Poly, board_items.GrPoly, board_items.FpPoly];

    layers_for(
        item: board_items.Poly | board_items.GrPoly | board_items.FpPoly,
    ) {
        return [item.layer];
    }

    paint(
        layer: ViewLayer,
        p: board_items.Poly | board_items.GrPoly | board_items.FpPoly,
    ) {
        if (this.filter_net) return;

        const color = layer.color;

        if (p.width) {
            this.styled_line(
                [...p.polyline, p.polyline[0]!],
                p.width,
                color,
                p.stroke_params,
            );
        }

        if (this.isFillValid(p.fill)) {
            this.gfx.polygon(new Polygon(p.polyline, color));
        }
    }
}

class ArcPainter extends GraphicItemPainter {
    classes = [board_items.GrArc, board_items.FpArc];

    layers_for(item: board_items.GrArc | board_items.FpArc) {
        return [item.layer];
    }

    paint(layer: ViewLayer, a: board_items.GrArc | board_items.FpArc) {
        if (this.filter_net) return;

        const arc = a.arc;
        const points = arc.to_polyline();
        // TODO: stroke style
        this.gfx.line(new Polyline(points, arc.width, layer.color));
    }
}

class CirclePainter extends GraphicItemPainter {
    classes = [board_items.GrCircle, board_items.FpCircle];

    layers_for(item: board_items.GrCircle | board_items.FpCircle) {
        return [item.layer];
    }

    paint(layer: ViewLayer, c: board_items.GrCircle | board_items.FpCircle) {
        if (this.filter_net) return;

        const color = layer.color;

        const radius = c.center.sub(c.end).magnitude;
        const arc = new Arc(
            c.center,
            radius,
            new Angle(0),
            new Angle(2 * Math.PI),
            c.width,
        );

        if (this.isFillValid(c.fill)) {
            this.gfx.circle(
                new Circle(arc.center, arc.radius + (c.width ?? 0), color),
            );
        } else {
            const points = arc.to_polyline();
            // TODO: stroke style
            this.gfx.line(new Polyline(points, arc.width, color));
        }
    }
}

class TraceSegmentPainter extends BoardItemPainter {
    classes = [board_items.LineSegment];

    layers_for(item: board_items.LineSegment) {
        return [item.layer];
    }

    paint(layer: ViewLayer, s: board_items.LineSegment) {
        if (this.filter_net && s.net != this.filter_net) {
            return;
        }

        const points = [s.start, s.end];
        this.gfx.line(new Polyline(points, s.width, layer.color));
    }
}

class TraceArcPainter extends BoardItemPainter {
    classes = [board_items.ArcSegment];

    layers_for(item: board_items.ArcSegment) {
        return [item.layer];
    }

    paint(layer: ViewLayer, a: board_items.ArcSegment) {
        if (this.filter_net && a.net != this.filter_net) {
            return;
        }

        const arc = Arc.from_three_points(a.start, a.mid, a.end, a.width);
        const points = arc.to_polyline();
        this.gfx.line(new Polyline(points, arc.width, layer.color));
    }
}

class ViaPainter extends BoardItemPainter {
    classes = [board_items.Via];

    layers_for(v: board_items.Via): string[] {
        if (v.layers) {
            // Blind/buried vias have two layers - the start and end layer,
            // and should only be drawn on the layers they're actually on.
            const layers = [];

            for (const cu_layer of copper_layers_between(
                v.layers[0]!,
                v.layers[1]!,
            )) {
                layers.push(
                    virtual_layer_for(
                        cu_layer,
                        CopperVirtualLayerNames.bb_via_holes,
                    ),
                );
                layers.push(
                    virtual_layer_for(
                        cu_layer,
                        CopperVirtualLayerNames.bb_via_hole_walls,
                    ),
                );
            }
            return layers;
        } else {
            return [LayerNames.via_holes, LayerNames.via_holewalls];
        }
    }

    paint(layer: ViewLayer, v: board_items.Via) {
        if (this.filter_net && v.net != this.filter_net) {
            return;
        }

        const color = layer.color;
        if (
            layer.name.endsWith("HoleWalls") ||
            layer.name == ViewLayerNames.overlay
        ) {
            this.gfx.circle(new Circle(v.at.position, v.size / 2, color));
        } else if (layer.name.endsWith("Holes")) {
            this.gfx.circle(new Circle(v.at.position, v.drill / 2, color));

            // Draw start and end layer markers
            if ((v.type == "blind" || v.type == "micro") && v.layers) {
                this.gfx.arc(
                    v.at.position,
                    v.size / 2 - v.size / 8,
                    Angle.from_degrees(180 + 70),
                    Angle.from_degrees(360 - 70),
                    v.size / 4,
                    layer.layer_set.by_name(v.layers[0]!)?.color ??
                        Color.transparent_black,
                );
                this.gfx.arc(
                    v.at.position,
                    v.size / 2 - v.size / 8,
                    Angle.from_degrees(70),
                    Angle.from_degrees(180 - 70),
                    v.size / 4,
                    layer.layer_set.by_name(v.layers[1]!)?.color ??
                        Color.transparent_black,
                );
            }
        }
    }
}

class ZonePainter extends BoardItemPainter {
    classes = [board_items.Zone];

    layers_for(z: board_items.Zone): string[] {
        const layers = z.layers ?? [z.layer];

        if (layers.length && layers[0] == "F&B.Cu") {
            layers.shift();
            layers.push("F.Cu", "B.Cu");
        }

        return layers.map((l) => {
            if (CopperLayerNames.includes(l as LayerNames)) {
                return virtual_layer_for(l, CopperVirtualLayerNames.zones);
            } else {
                return l;
            }
        });
    }

    paint(layer: ViewLayer, z: board_items.Zone) {
        if (!z.filled_polygons) {
            return;
        }

        if (this.filter_net && z.net != this.filter_net) {
            return;
        }

        for (const p of z.filled_polygons) {
            if (
                !layer.name.includes(p.layer) &&
                layer.name != ViewLayerNames.overlay
            ) {
                continue;
            }

            this.gfx.polygon(new Polygon(p.polyline, layer.color));
        }
    }
}

/*
 * Pad labels: the pad number and net name drawn inside each pad. This rule is
 * our own, chosen for legibility; it does not reproduce any other tool's.
 *
 * - A label stays inside the pad's shape, rounded corners and oval ends
 *   included, less a margin of a tenth of the pad's short side all round.
 * - It runs along the pad's long axis: for a square pad, the axis nearer the
 *   screen's horizontal; for a round pad, the horizontal itself. It reads
 *   left to right, or bottom to top when vertical, whatever the footprint's
 *   rotation or the view's flip.
 * - Two lines, the number above the net name, each as large as fits its half
 *   of the pad and its own length. A no-connect pad has a cross in place of
 *   the net name.
 * - No text is larger than `max_size` of the pad's short side (a capital's
 *   height, descenders aside), and none is drawn under `min_size`: if either
 *   line of the two would be, the net name (or cross) alone is tried, then
 *   the number alone, then nothing.
 * - A net name shows only its last hierarchical segment, the text after the
 *   last "/" outside brackets: "/Power/+3V3" shows "+3V3", while
 *   "Net-(U1-PA9/TX)" stays whole.
 */
const pad_label = {
    /** Clearance to the pad's edge, as a fraction of its short side. */
    margin: 0.1,
    /** Space between the two lines, as a fraction of the short side. */
    gap: 0.1,
    /** Largest text size, as a fraction of the short side. */
    max_size: 0.45,
    /** Pen width, as a fraction of the text size. */
    pen: 0.15,
    /** Smallest text size drawn, in millimetres. */
    min_size: 0.08,
};

/**
 * A label line at text size 1, centred on the box its stroke centre-lines
 * span, which is `w` wide and `h` tall.
 */
interface LabelInk {
    strokes: Vec2[][];
    w: number;
    h: number;
}

/** The no-connect cross: a square as tall as a capital. */
const no_connect_ink: LabelInk = {
    strokes: [
        [new Vec2(-0.5, -0.5), new Vec2(0.5, 0.5)],
        [new Vec2(-0.5, 0.5), new Vec2(0.5, -0.5)],
    ],
    w: 1,
    h: 1,
};

const label_inks = new Map<string, LabelInk | null>();

/** A line of text in the stroke font, or null if it draws nothing. */
function text_ink(text: string): LabelInk | null {
    let ink = label_inks.get(text);
    if (ink !== undefined) {
        return ink;
    }

    const font = StrokeFont.default();
    const layout = font.layout_line(text, new Vec2(1, 1), false);
    const strokes = layout.glyphs.flatMap((g) => (g as StrokeGlyph).strokes);
    const bar_y = -font.compute_overbar_vertical_position(1);
    for (const [x0, x1] of layout.overbars) {
        strokes.push([new Vec2(x0, bar_y), new Vec2(x1, bar_y)]);
    }

    ink = null;
    const points = strokes.flat();
    if (points.length) {
        const box = BBox.from_points(points);
        const c = box.center;
        ink = {
            strokes: strokes.map((s) => s.map((p) => p.sub(c))),
            w: box.w,
            h: box.h,
        };
    }
    label_inks.set(text, ink);
    return ink;
}

/** A net name's last hierarchical segment; see the pad label rule. */
function net_label(name: string): string {
    let depth = 0;
    let start = 0;
    for (let i = 0; i < name.length; i++) {
        const c = name[i];
        if (c == "(" || c == "[" || c == "{") {
            depth++;
        } else if (c == ")" || c == "]" || c == "}") {
            depth = Math.max(depth - 1, 0);
        } else if (c == "/" && depth == 0) {
            start = i + 1;
        }
    }
    return start < name.length ? name.slice(start) : name;
}

/**
 * Where a label may go: a rounded rectangle centred on the pad, `hl` and `hs`
 * its half extents along and across the text, `r` its corner radius.
 */
interface LabelArea {
    hl: number;
    hs: number;
    r: number;
}

/**
 * The pad's shape as a rounded rectangle in its own frame (half sides and
 * corner radius), inside the shape drawn; null for shapes without labels.
 */
function pad_outline(pad: board_items.Pad) {
    const shape = pad.shape == "custom" ? pad.options?.anchor : pad.shape;
    const hx = pad.size.x / 2;
    const hy = pad.size.y / 2;
    const rounding = 2 * Math.min(hx, hy) * (pad.roundrect_rratio ?? 0);
    switch (shape) {
        case "circle":
            return { hx, hy: hx, r: hx };
        case "rect":
            return { hx, hy, r: 0 };
        case "oval":
            return { hx, hy, r: Math.min(hx, hy) };
        case "roundrect":
            return { hx, hy, r: rounding };
        case "trapezoid": {
            // Bounded by the trapezoid's narrower ends.
            const delta = pad.rect_delta ?? new Vec2(0, 0);
            return {
                hx: hx - Math.abs(delta.y) / 2,
                hy: hy - Math.abs(delta.x) / 2,
                r: rounding,
            };
        }
        default:
            return null;
    }
}

/**
 * The largest text size, up to `largest`, at which `ink`, drawn with the
 * label pen and centred `v` across the area, stays inside the area and
 * within the band `band` tall around `v`.
 */
function fit_label_size(
    ink: LabelInk,
    area: LabelArea,
    v: number,
    band: number,
    largest: number,
) {
    // The ink's box at size s is s * w by s * h.
    const w = ink.w + pad_label.pen;
    const h = ink.h + pad_label.pen;
    const size = Math.min(largest, band / h, (2 * area.hl) / w);
    if (!(size > 0)) {
        return 0;
    }

    // Within the straight sides, the box's outer corner can still poke out of
    // a rounded corner: dx, dy past the corner's centre must stay within r.
    const y = Math.abs(v);
    const cx = area.hl - area.r;
    const cy = area.hs - area.r;
    const dx = (size * w) / 2 - cx;
    const dy = y + (size * h) / 2 - cy;
    if (dx <= 0 || dy <= 0 || dx * dx + dy * dy <= area.r * area.r) {
        return size;
    }

    // The size at which the corner meets the arc: the larger root of
    // (s w/2 - cx)^2 + (y + s h/2 - cy)^2 = r^2.
    const a = (w * w + h * h) / 4;
    const b = h * (y - cy) - w * cx;
    const c = cx * cx + (y - cy) ** 2 - area.r ** 2;
    return (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

/**
 * Sizes and places label lines, stacked in order across the area; null if
 * any would be smaller than `pad_label.min_size`.
 */
function place_label_lines(lines: LabelInk[], area: LabelArea, short: number) {
    // Equal bands across the area, one per line, `gap` apart.
    const gap = lines.length > 1 ? pad_label.gap * short : 0;
    const band = (2 * area.hs - gap) / lines.length;
    const largest = pad_label.max_size * short;

    // Fit each line centred in its own band...
    const sizes: number[] = [];
    for (const [i, ink] of lines.entries()) {
        const v = (i - (lines.length - 1) / 2) * (band + gap);
        const size = fit_label_size(ink, area, v, band, largest);
        if (size < pad_label.min_size) {
            return null;
        }
        sizes.push(size);
    }

    // ...then close the lines up about the middle. Each moves towards it,
    // which keeps it inside: the area is convex and symmetric.
    const heights = lines.map((ink, i) => sizes[i]! * (ink.h + pad_label.pen));
    const total =
        heights.reduce((sum, h) => sum + h, 0) + gap * (lines.length - 1);
    let v = -total / 2;
    return lines.map((ink, i) => {
        const placed = { ink, size: sizes[i]!, v: v + heights[i]! / 2 };
        v += heights[i]! + gap;
        return placed;
    });
}

class PadPainter extends BoardItemPainter {
    classes = [board_items.Pad];

    layers_for(pad: board_items.Pad): string[] {
        const layers: string[] = [];

        for (const layer of pad.layers) {
            if (layer == "*.Cu") {
                layers.push(LayerNames.pads_front);
                layers.push(LayerNames.pads_back);
            } else if (layer == "F.Cu") {
                layers.push(LayerNames.pads_front);
            } else if (layer == "B.Cu") {
                layers.push(LayerNames.pads_back);
            } else if (layer == "*.Mask") {
                layers.push(LayerNames.f_mask);
                layers.push(LayerNames.b_mask);
            } else if (layer == "*.Paste") {
                layers.push(LayerNames.f_paste);
                layers.push(LayerNames.b_paste);
            } else {
                layers.push(layer);
            }
        }

        switch (pad.type) {
            case "thru_hole":
                layers.push(LayerNames.pad_holewalls);
                layers.push(LayerNames.pad_holes_netname);
                layers.push(LayerNames.pad_holes);
                break;
            case "np_thru_hole":
                layers.push(LayerNames.non_plated_holes);
                break;
            case "smd":
                // Only use pads_front_netname/pads_back_netname in SMD pads.
                // Thru_hole pads uses the pad_holes_netname layer
                if (layers.includes(LayerNames.pads_front)) {
                    layers.push(LayerNames.pads_front_netname);
                } else if (layers.includes(LayerNames.pads_back)) {
                    layers.push(LayerNames.pads_back_netname);
                }
                break;
            case "connect":
                break;
            default:
                log.warn(`Unhandled pad type "${pad.type}"`);
                break;
        }

        return layers;
    }

    paint(layer: ViewLayer, pad: board_items.Pad) {
        if (this.filter_net && pad.net?.number != this.filter_net) {
            return;
        }

        const color = layer.color;

        const position_mat = Matrix3.translation(
            pad.at.position.x,
            pad.at.position.y,
        );
        position_mat.rotate_self(-Angle.deg_to_rad(pad.parent.at.rotation));
        position_mat.rotate_self(Angle.deg_to_rad(pad.at.rotation));

        this.gfx.state.push();
        this.gfx.state.multiply(position_mat);

        const center = new Vec2(0, 0);

        const is_hole_layer =
            layer.name == LayerNames.pad_holes ||
            layer.name == LayerNames.non_plated_holes;

        const is_netname_layer =
            layer.name == LayerNames.pads_front_netname ||
            layer.name == LayerNames.pads_back_netname ||
            layer.name == LayerNames.pad_holes_netname;

        if (is_netname_layer) {
            if (pad.drill?.offset) {
                this.gfx.state.matrix.translate_self(
                    pad.drill.offset.x,
                    pad.drill.offset.y,
                );
            }
            this.paint_label(pad, color);
        } else if (is_hole_layer && pad.drill != null) {
            if (!pad.drill.oval) {
                const drill_pos = center;
                this.gfx.circle(
                    new Circle(drill_pos, pad.drill.diameter / 2, color),
                );
            } else {
                const half_size = new Vec2(
                    pad.drill.diameter / 2,
                    (pad.drill.width ?? 0) / 2,
                );

                const half_width = Math.min(half_size.x, half_size.y);

                const half_len = new Vec2(
                    half_size.x - half_width,
                    half_size.y - half_width,
                );

                const drill_pos = center.add(pad.drill.offset);
                const drill_start = drill_pos.sub(half_len);
                const drill_end = drill_pos.add(half_len);

                this.gfx.line(
                    new Polyline(
                        [drill_start, drill_end],
                        half_width * 2,
                        color,
                    ),
                );
            }
        } else {
            let shape = pad.shape;
            if (shape == "custom" && pad.options?.anchor) {
                shape = pad.options.anchor;
            }

            if (pad.drill?.offset) {
                this.gfx.state.matrix.translate_self(
                    pad.drill.offset.x,
                    pad.drill.offset.y,
                );
            }

            switch (shape) {
                case "circle":
                    this.gfx.circle(new Circle(center, pad.size.x / 2, color));
                    break;
                case "rect":
                    {
                        const rect_points = [
                            new Vec2(-pad.size.x / 2, -pad.size.y / 2),
                            new Vec2(pad.size.x / 2, -pad.size.y / 2),
                            new Vec2(pad.size.x / 2, pad.size.y / 2),
                            new Vec2(-pad.size.x / 2, pad.size.y / 2),
                        ];
                        this.gfx.polygon(new Polygon(rect_points, color));
                    }
                    break;
                case "roundrect":
                case "trapezoid":
                    // KiCad approximates rounded rectangles using four line segments
                    // with their width set to the round radius. Clever bastards.
                    // Since our polylines aren't filled, we'll add both a polygon
                    // and a polyline.
                    {
                        const rounding =
                            Math.min(pad.size.x, pad.size.y) *
                            (pad.roundrect_rratio ?? 0);
                        let half_size = new Vec2(
                            pad.size.x / 2,
                            pad.size.y / 2,
                        );
                        half_size = half_size.sub(new Vec2(rounding, rounding));

                        let trap_delta = pad.rect_delta
                            ? pad.rect_delta.copy()
                            : new Vec2(0, 0);
                        trap_delta = trap_delta.multiply(0.5);

                        const rect_points = [
                            new Vec2(
                                -half_size.x - trap_delta.y,
                                half_size.y + trap_delta.x,
                            ),
                            new Vec2(
                                half_size.x + trap_delta.y,
                                half_size.y - trap_delta.x,
                            ),
                            new Vec2(
                                half_size.x - trap_delta.y,
                                -half_size.y + trap_delta.x,
                            ),
                            new Vec2(
                                -half_size.x + trap_delta.y,
                                -half_size.y - trap_delta.x,
                            ),
                        ];

                        // this.gfx.push_transform(offset_mat);
                        this.gfx.polygon(new Polygon(rect_points, color));
                        this.gfx.line(
                            new Polyline(
                                [...rect_points, rect_points[0]!],
                                rounding * 2,
                                color,
                            ),
                        );
                        // this.gfx.pop_transform();
                    }
                    break;

                case "oval":
                    {
                        const half_size = new Vec2(
                            pad.size.x / 2,
                            pad.size.y / 2,
                        );
                        const half_width = Math.min(half_size.x, half_size.y);
                        const half_len = new Vec2(
                            half_size.x - half_width,
                            half_size.y - half_width,
                        );

                        const pad_pos = center;
                        const pad_start = pad_pos.sub(half_len);
                        const pad_end = pad_pos.add(half_len);

                        if (pad_start.equals(pad_end)) {
                            this.gfx.circle(
                                new Circle(pad_pos, half_width, color),
                            );
                        } else {
                            this.gfx.line(
                                new Polyline(
                                    [pad_start, pad_end],
                                    half_width * 2,
                                    color,
                                ),
                            );
                        }
                    }
                    break;

                default:
                    log.warn(`Unknown pad shape "${pad.shape}"`);
                    break;
            }

            if (pad.shape == "custom" && pad.primitives) {
                for (const prim of pad.primitives) {
                    this.view_painter.paint_item(layer, prim);
                }
            }
        }

        this.gfx.state.pop();
    }

    /** Draws the pad's label, centred on the pad's shape; see the rule above. */
    private paint_label(pad: board_items.Pad, color: Color) {
        const outline = pad_outline(pad);
        if (!outline) {
            return;
        }

        const number = pad.number ? text_ink(pad.number) : null;
        let net: LabelInk | null = null;
        if (pad.pintype?.includes("no_connect")) {
            net = no_connect_ink;
        } else if (pad.netname) {
            net = text_ink(net_label(pad.netname));
        }

        // The pad's own directions as seen on screen, mirrored in a flipped
        // view.
        const m = this.gfx.state.matrix;
        const origin = m.transform(new Vec2(0, 0));
        const mirror = this.gfx.state.flipped ? -1 : 1;
        const on_screen = (v: Vec2) => {
            const d = m.transform(v).sub(origin);
            return new Vec2(d.x * mirror, d.y);
        };

        // The text's direction in the pad's frame: the long axis, whichever
        // way reads best, or for a round pad the screen's horizontal.
        let along: Vec2;
        const round = outline.hx == outline.hy && outline.r >= outline.hx;
        if (round) {
            const sx = on_screen(new Vec2(1, 0));
            const sy = on_screen(new Vec2(0, 1));
            along = new Vec2(sy.y, -sx.y);
            along = along.multiply(1 / along.magnitude);
            if (on_screen(along).x < 0) {
                along = along.multiply(-1);
            }
        } else {
            const axes: Vec2[] = [];
            if (outline.hx >= outline.hy) {
                axes.push(new Vec2(1, 0), new Vec2(-1, 0));
            }
            if (outline.hy >= outline.hx) {
                axes.push(new Vec2(0, 1), new Vec2(0, -1));
            }
            // Most rightward on screen; of two equally so, the upward.
            const eps = 1e-9;
            let best = on_screen(axes[0]!);
            along = axes[0]!;
            for (const axis of axes.slice(1)) {
                const s = on_screen(axis);
                if (
                    s.x > best.x + eps ||
                    (s.x > best.x - eps && s.y < best.y)
                ) {
                    best = s;
                    along = axis;
                }
            }
        }

        // Down the text: the perpendicular that is clockwise of `along` on
        // screen, so the text is never seen mirrored.
        let across = new Vec2(-along.y, along.x);
        if (on_screen(along).cross(on_screen(across)) < 0) {
            across = across.multiply(-1);
        }

        const [hl, hs] =
            Math.abs(along.x) >= Math.abs(along.y)
                ? [outline.hx, outline.hy]
                : [outline.hy, outline.hx];
        const short = 2 * Math.min(outline.hx, outline.hy);
        const margin = pad_label.margin * short;
        const area = {
            hl: hl - margin,
            hs: hs - margin,
            r: Math.max(outline.r - margin, 0),
        };

        const choices: LabelInk[][] = [];
        if (number && net) {
            choices.push([number, net]);
        }
        if (net) {
            choices.push([net]);
        }
        if (number) {
            choices.push([number]);
        }

        for (const lines of choices) {
            const placed = place_label_lines(lines, area, short);
            if (!placed) {
                continue;
            }
            for (const { ink, size, v } of placed) {
                for (const stroke of ink.strokes) {
                    this.gfx.line(
                        stroke.map((p) =>
                            along
                                .multiply(p.x * size)
                                .add(across.multiply(v + p.y * size)),
                        ),
                        pad_label.pen * size,
                        color,
                    );
                }
            }
            return;
        }
    }
}

class GrTextPainter extends BoardItemPainter {
    classes = [board_items.GrText];

    layers_for(t: board_items.GrText) {
        return [t.layer.name];
    }

    paint(layer: ViewLayer, t: board_items.GrText) {
        if (this.filter_net) return;

        if (t.hide || !t.shown_text) {
            return;
        }

        if (t.render_cache) {
            for (const poly of t.render_cache.polygons) {
                this.view_painter.paint_item(layer, poly);
            }
            return;
        }

        const edatext = new EDAText(t.shown_text);

        edatext.apply_effects(t.effects);
        edatext.apply_at(t.at);

        edatext.attributes.color = layer.color;

        if (!is_manufacturing_layer(layer.name) && this.gfx.state.flipped) {
            // TODO: donot flip text in non-manufacturing layers
        }

        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            edatext.shown_text,
            edatext.text_pos,
            edatext.attributes,
        );
        this.gfx.state.pop();
    }
}

class FpTextPainter extends BoardItemPainter {
    classes = [board_items.FpText];

    layers_for(t: board_items.FpText) {
        if (t.hide) {
            return [];
        } else {
            return [t.layer.name];
        }
    }

    paint(layer: ViewLayer, t: board_items.FpText) {
        if (this.filter_net) return;

        if (t.hide || !t.shown_text) {
            return;
        }

        if (t.render_cache) {
            this.gfx.state.push();
            this.gfx.state.matrix = Matrix3.identity();
            for (const poly of t.render_cache.polygons) {
                this.view_painter.paint_item(layer, poly);
            }
            this.gfx.state.pop();
            return;
        }

        const edatext = new EDAText(t.shown_text);

        edatext.apply_effects(t.effects);
        edatext.apply_at(t.at);

        edatext.attributes.keep_upright = !t.at.unlocked;
        edatext.attributes.color = layer.color;

        if (t.parent) {
            const rot = Angle.from_degrees(t.parent.at.rotation);
            let pos = edatext.text_pos;
            pos = rot.rotate_point(pos, new Vec2(0, 0));
            pos = pos.add(t.parent.at.position.multiply(10000));
            edatext.text_pos.set(pos);
        }

        if (edatext.attributes.keep_upright) {
            while (edatext.text_angle.degrees > 90) {
                edatext.text_angle.degrees -= 180;
            }
            while (edatext.text_angle.degrees <= -90) {
                edatext.text_angle.degrees += 180;
            }
        }

        this.gfx.state.push();
        this.gfx.state.matrix = Matrix3.identity();

        StrokeFont.default().draw(
            this.gfx,
            edatext.shown_text,
            edatext.text_pos,
            edatext.attributes,
        );
        this.gfx.state.pop();
    }
}

class PropertyTextPainter extends BoardItemPainter {
    classes = [board_items.SymbolProperty];

    layers_for(t: board_items.SymbolProperty) {
        return [t.layer];
    }

    paint(layer: ViewLayer, t: board_items.SymbolProperty) {
        if (this.filter_net) return;

        if (t.hide || !t.shown_text || !t.has_symbol_prop) {
            return;
        }

        const edatext = new EDAText(t.shown_text);

        edatext.apply_effects(t.effects);
        edatext.apply_at(t.at);

        edatext.attributes.color = layer.color;
        edatext.attributes.keep_upright = !t.at.unlocked;

        // Keep the text upright if needed
        if (edatext.attributes.keep_upright) {
            while (edatext.text_angle.degrees > 90) {
                edatext.text_angle.degrees -= 180;
            }
            while (edatext.text_angle.degrees <= -90) {
                edatext.text_angle.degrees += 180;
            }
        }

        // Looks like the rotation angle for KiCad's symbol attribute rendering
        // is standalone, so we need to subtract it from its parent's rotation angle.
        if (t.parent) {
            const rot = t.parent.at.rotation;
            edatext.text_angle.degrees -= rot;
        }

        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            edatext.shown_text,
            edatext.text_pos,
            edatext.attributes,
        );
        this.gfx.state.pop();
    }
}

class DimensionPainter extends BoardItemPainter {
    classes = [board_items.Dimension];

    layers_for(d: board_items.Dimension): string[] {
        return [d.layer];
    }

    paint(layer: ViewLayer, d: board_items.Dimension) {
        switch (d.type) {
            case "orthogonal":
            case "aligned":
                this.paint_linear(layer, d);
                break;
            case "center":
                this.paint_center(layer, d);
                break;
            case "radial":
                this.paint_radial(layer, d);
                break;
            case "leader":
                this.paint_leader(layer, d);
                break;
        }
    }

    paint_center(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        let arm = d.end.sub(d.start);
        this.gfx.line(
            [d.start.sub(arm), d.start.add(arm)],
            thickness,
            layer.color,
        );

        arm = Angle.from_degrees(90).rotate_point(arm);
        this.gfx.line(
            [d.start.sub(arm), d.start.add(arm)],
            thickness,
            layer.color,
        );
    }

    paint_radial(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        const center = d.start.copy();
        let center_arm = new Vec2(0, d.style.arrow_length);

        // Cross shape
        this.gfx.line(
            [center.sub(center_arm), center.add(center_arm)],
            thickness,
            layer.color,
        );

        center_arm = Angle.from_degrees(90).rotate_point(center_arm);
        this.gfx.line(
            [center.sub(center_arm), center.add(center_arm)],
            thickness,
            layer.color,
        );

        // Line from center to text.
        let radial = d.end.sub(d.start);
        radial = radial.resize(d.leader_length);

        const text = this.make_text(layer, d);
        const text_bbox = text.get_text_box().scale(1 / 10000);

        const line_segs = [d.end, d.end.add(radial), d.gr_text.at.position];

        const textbox_pt = text_bbox.intersect_segment(
            line_segs[1]!,
            line_segs[2]!,
        );

        if (textbox_pt) {
            line_segs[2] = textbox_pt;
        }

        this.gfx.line(line_segs, thickness, layer.color);

        // Arrows
        const arrow_angle = Angle.from_degrees(27.5);
        const inv_radial_angle = radial.angle.negative();
        const arrow_seg = new Vec2(d.style.arrow_length, 0);
        const arrow_end_pos = inv_radial_angle
            .add(arrow_angle)
            .rotate_point(arrow_seg);
        const arrow_end_neg = inv_radial_angle
            .sub(arrow_angle)
            .rotate_point(arrow_seg);

        this.gfx.line(
            [d.end.add(arrow_end_neg), d.end, d.end.add(arrow_end_pos)],
            thickness,
            layer.color,
        );

        // Text
        this.paint_text(text);
    }

    paint_leader(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        // Line from center to text.
        const text = this.make_text(layer, d);
        const text_bbox = text
            .get_text_box()
            .grow(text.text_width / 2, text.get_effective_text_thickness() * 2)
            .scale(1 / 10000);

        const start = d.start.add(
            d.end.sub(d.start).resize(d.style.extension_offset),
        );
        const line_segs = [start, d.end, d.gr_text.at.position];

        const textbox_pt = text_bbox.intersect_segment(
            line_segs[1]!,
            line_segs[2]!,
        );

        if (textbox_pt) {
            line_segs[2] = textbox_pt;
        }

        this.gfx.line(line_segs, thickness, layer.color);

        // Outline
        if (d.style.text_frame == 1) {
            this.gfx.line(
                Polyline.from_BBox(text_bbox, thickness, layer.color),
            );
        }
        if (d.style.text_frame == 2) {
            const radius =
                text_bbox.w / 2 -
                text.get_effective_text_thickness() / 10000 / 2;
            this.gfx.arc(
                text_bbox.center,
                radius,
                Angle.from_degrees(0),
                Angle.from_degrees(360),
                thickness,
                layer.color,
            );
        }

        // Arrows
        const radial = d.end.sub(d.start);
        const arrow_angle = Angle.from_degrees(27.5);
        const inv_radial_angle = radial.angle.negative();
        const arrow_seg = new Vec2(d.style.arrow_length, 0);
        const arrow_end_pos = inv_radial_angle
            .add(arrow_angle)
            .rotate_point(arrow_seg);
        const arrow_end_neg = inv_radial_angle
            .sub(arrow_angle)
            .rotate_point(arrow_seg);

        this.gfx.line(
            [start.add(arrow_end_neg), start, start.add(arrow_end_pos)],
            thickness,
            layer.color,
        );

        // Text
        this.paint_text(text);
    }

    /**
     * An aligned or orthogonal dimension: two extension lines, the crossbar
     * and an arrowhead at each end of it, then its text where the file puts
     * it. Measured against KiCad 9 (pcbnew's shapes for 25 dimensions, both
     * kinds, heights of both signs and zero, crossbars beyond and between
     * the points, both orientations, custom styles; checked on the plotted
     * SVG):
     *  - aligned: the crossbar is the measured segment moved `height` along
     *    its normal (+y for a segment towards +x); each extension line runs
     *    along that normal, on the height's side (the -normal side at 0),
     *    from `extension_offset` off its point to `extension_height` past
     *    the crossbar;
     *  - orthogonal: the crossbar is horizontal at y = start.y + height
     *    (orientation 0) or vertical at x = start.x + height (1), spanning
     *    the two points; each extension line runs from its point towards
     *    the crossbar, the same offset and overshoot (nothing when the point
     *    is on the crossbar's line);
     *  - each arrowhead is two strokes `arrow_length` long from the crossbar
     *    end, 27.5 degrees either side of the crossbar, pointing out.
     * A missing extension_offset is 0 and extension_height 0.58642.
     */
    paint_linear(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;
        const offset = d.style.extension_offset ?? 0;
        const overshoot = d.style.extension_height ?? 0.58642;
        const arrow = d.style.arrow_length;
        const line = (pts: Vec2[]) =>
            this.gfx.line(pts, thickness, layer.color);
        const extension = (point: Vec2, foot: Vec2, dir: Vec2) =>
            line([
                point.add(dir.multiply(offset)),
                foot.add(dir.multiply(overshoot)),
            ]);

        let a: Vec2;
        let b: Vec2;
        if (d.type == "orthogonal") {
            const horizontal = d.orientation == 0;
            a = horizontal
                ? new Vec2(d.start.x, d.start.y + d.height)
                : new Vec2(d.start.x + d.height, d.start.y);
            b = horizontal ? new Vec2(d.end.x, a.y) : new Vec2(a.x, d.end.y);
            // A unit step along the axis from the point to its foot (zero
            // when the point is on the crossbar's line).
            const towards = (from: Vec2, to: Vec2) =>
                new Vec2(Math.sign(to.x - from.x), Math.sign(to.y - from.y));
            extension(d.start, a, towards(d.start, a));
            extension(d.end, b, towards(d.end, b));
        } else {
            const along = d.end.sub(d.start).normalize();
            const normal = new Vec2(-along.y, along.x);
            a = d.start.add(normal.multiply(d.height));
            b = d.end.add(normal.multiply(d.height));
            const side = normal.multiply(d.height > 0 ? 1 : -1);
            extension(d.start, a, side);
            extension(d.end, b, side);
        }
        line([a, b]);

        const spread = Angle.deg_to_rad(27.5);
        const [cos, sin] = [Math.cos(spread), Math.sin(spread)];
        for (const [tip, back] of [
            [a, b],
            [b, a],
        ] as const) {
            const u = back.sub(tip).normalize().multiply(arrow);
            line([
                tip.add(new Vec2(u.x * cos + u.y * sin, u.y * cos - u.x * sin)),
                tip,
                tip.add(new Vec2(u.x * cos - u.y * sin, u.y * cos + u.x * sin)),
            ]);
        }

        this.paint_text(this.make_text(layer, d));
    }

    make_text(layer: ViewLayer, d: board_items.Dimension) {
        const pcbtext = new EDAText(d.gr_text.shown_text);
        pcbtext.apply_effects(d.gr_text.effects);
        pcbtext.apply_at(d.gr_text.at);
        pcbtext.attributes.color = layer.color;

        return pcbtext;
    }

    paint_text(text: EDAText) {
        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            text.shown_text,
            text.text_pos,
            text.attributes,
        );
        this.gfx.state.pop();
    }
}

class FootprintPainter extends BoardItemPainter {
    classes = [board_items.Footprint];

    layers_for(fp: board_items.Footprint): string[] {
        const layers = new Set();
        for (const item of fp.items()) {
            const item_layers = this.view_painter.layers_for(item);
            for (const layer of item_layers) {
                layers.add(layer);
            }
        }
        return Array.from(layers.values()) as string[];
    }

    paint(layer: ViewLayer, fp: board_items.Footprint) {
        const matrix = Matrix3.translation(
            fp.at.position.x,
            fp.at.position.y,
        ).rotate_self(Angle.deg_to_rad(fp.at.rotation));

        this.gfx.state.push();
        this.gfx.state.multiply(matrix);

        for (const item of fp.items()) {
            const item_layers = this.view_painter.layers_for(item);
            if (
                layer.name == ViewLayerNames.overlay ||
                item_layers.includes(layer.name)
            ) {
                this.view_painter.paint_item(layer, item);
            }
        }

        this.gfx.state.pop();
    }
}

export class BoardPainter extends DocumentPainter {
    override theme: BoardTheme;

    constructor(gfx: Renderer, layers: LayerSet, theme: BoardTheme) {
        super(gfx, layers, theme);
        this.painter_list = [
            new LinePainter(this, gfx),
            new RectPainter(this, gfx),
            new PolyPainter(this, gfx),
            new ArcPainter(this, gfx),
            new CirclePainter(this, gfx),
            new TraceSegmentPainter(this, gfx),
            new TraceArcPainter(this, gfx),
            new ViaPainter(this, gfx),
            new ZonePainter(this, gfx),
            new PadPainter(this, gfx),
            new FootprintPainter(this, gfx),
            new GrTextPainter(this, gfx),
            new FpTextPainter(this, gfx),
            new PropertyTextPainter(this, gfx),
            new DimensionPainter(this, gfx),
        ];
    }

    // Used to filter out items by net when highlighting nets. Painters
    // should use this to determine whether to draw or skip the current item.
    filter_net: number | null = null;

    paint_net(board: board_items.KicadPCB, net: number) {
        const layer = this.layers.overlay;

        this.filter_net = net;

        layer.clear();
        layer.color = Color.white;
        this.gfx.start_layer(layer.name);

        for (const item of board.items()) {
            const painter = this.painter_for(item);

            if (!painter) {
                continue;
            }

            this.paint_item(layer, item);
        }

        layer.graphics = this.gfx.end_layer();
        layer.graphics.composite_operation = "overlay";
        this.filter_net = null;
    }
}
