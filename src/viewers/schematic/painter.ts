/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, BBox, Arc as MathArc, Matrix3, Vec2 } from "../../base/math";
import {
    Arc,
    Circle,
    Color,
    Polygon,
    Polyline,
    Renderer,
} from "../../graphics";
import type { SchematicTheme } from "../../kicad";
import * as schematic_items from "../../kicad/schematic";
import { LibText, SchText, StrokeFont } from "../../kicad/text";
import { StrokePainter } from "../base/painter";
import { LayerNames, LayerSet, ViewLayer } from "./layers";
import {
    BaseSchematicPainter,
    SchematicItemPainter,
    text_box,
    text_pen,
    type TextPlacement,
} from "./painters/base";
import {
    GlobalLabelPainter,
    HierarchicalLabelPainter,
    DirectiveLabelPainter,
    NetLabelPainter,
} from "./painters/label";
import { PinPainter } from "./painters/pin";
import {
    LibSymbolPainter,
    SchematicSymbolPainter,
    type SymbolTransform,
} from "./painters/symbol";

class RectanglePainter extends SchematicItemPainter {
    classes = [schematic_items.Rectangle];

    layers_for(item: schematic_items.Rectangle) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, r: schematic_items.Rectangle) {
        const pts = [
            r.start,
            new Vec2(r.end.x, r.start.y),
            r.end,
            new Vec2(r.start.x, r.end.y),
            r.start,
        ];

        this.#fill(layer, r, pts);
        this.#stroke(layer, r, pts);
    }

    #stroke(layer: ViewLayer, r: schematic_items.Rectangle, pts: Vec2[]) {
        const { width, color } = this.determine_stroke(layer, r);

        if (!width || !color) {
            return;
        }

        this.gfx.line(
            new Polyline(
                pts,
                r.stroke?.width || this.gfx.state.stroke_width,
                color,
            ),
        );
    }

    #fill(layer: ViewLayer, r: schematic_items.Rectangle, pts: Vec2[]) {
        const color = this.determine_fill(layer, r);

        if (!color) {
            return;
        }

        this.gfx.polygon(new Polygon(pts, color));
    }
}

class PolylinePainter extends SchematicItemPainter {
    classes = [schematic_items.Polyline];

    layers_for(item: schematic_items.Polyline) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, pl: schematic_items.Polyline) {
        this.#fill(layer, pl);
        this.#stroke(layer, pl);
    }

    #stroke(layer: ViewLayer, pl: schematic_items.Polyline) {
        const { width, color } = this.determine_stroke(layer, pl);

        if (!width || !color) {
            return;
        }

        const draw_line = (lines: Vec2[]) => {
            this.gfx.line(lines, width, color);
        };

        StrokePainter.line(pl.pts, width, pl.stroke_params, draw_line);
    }

    #fill(layer: ViewLayer, pl: schematic_items.Polyline) {
        const color = this.determine_fill(layer, pl);

        if (!color) {
            return;
        }

        this.gfx.polygon(new Polygon(pl.pts, color));
    }
}

class RuleAreaPainter extends SchematicItemPainter {
    classes = [schematic_items.RuleArea];

    layers_for(item: schematic_items.RuleArea) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, item: schematic_items.RuleArea) {
        const pts = [...item.polyline.pts, item.polyline.pts[0]!.copy()];

        // fill polyline
        const fill_color = this.determine_fill(layer, item.polyline);
        if (fill_color) {
            this.gfx.polygon(new Polygon(pts, fill_color));
        }

        // polyline outline
        const outline_width =
            item.polyline.stroke?.width || this.gfx.state.stroke_width;

        const outline_color =
            item.polyline.stroke?.color || this.theme.rule_area;

        if (outline_width && outline_color) {
            const draw_line = (lines: Vec2[]) => {
                this.gfx.line(lines, outline_width, outline_color);
            };

            StrokePainter.line(
                pts,
                outline_width,
                item.polyline.stroke_params,
                draw_line,
            );
        }
    }
}

class WirePainter extends SchematicItemPainter {
    classes = [schematic_items.Wire];

    layers_for(item: schematic_items.Wire) {
        return [LayerNames.wire];
    }

    paint(layer: ViewLayer, w: schematic_items.Wire) {
        this.gfx.line(
            new Polyline(w.pts, this.gfx.state.stroke_width, this.theme.wire),
        );
    }
}

class BusPainter extends SchematicItemPainter {
    classes = [schematic_items.Bus];

    layers_for(item: schematic_items.Bus) {
        return [LayerNames.wire];
    }

    paint(layer: ViewLayer, w: schematic_items.Bus) {
        this.gfx.line(
            new Polyline(
                w.pts,
                schematic_items.DefaultValues.bus_width,
                this.theme.bus,
            ),
        );
    }
}

class BusEntryPainter extends SchematicItemPainter {
    classes = [schematic_items.BusEntry];

    layers_for(item: schematic_items.BusEntry) {
        return [LayerNames.junction];
    }

    paint(layer: ViewLayer, be: schematic_items.BusEntry) {
        this.gfx.line(
            new Polyline(
                [be.at.position, be.at.position.add(be.size)],
                schematic_items.DefaultValues.wire_width,
                this.theme.wire,
            ),
        );
    }
}

class CirclePainter extends SchematicItemPainter {
    classes = [schematic_items.Circle];

    layers_for(item: schematic_items.Circle) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, c: schematic_items.Circle) {
        this.#fill(layer, c);
        this.#stroke(layer, c);
    }

    #stroke(layer: ViewLayer, c: schematic_items.Circle) {
        const { width, color } = this.determine_stroke(layer, c);

        if (!width || !color) {
            return;
        }

        this.gfx.arc(
            new Arc(
                c.center,
                c.radius,
                new Angle(0),
                new Angle(Math.PI * 2),
                width,
                color,
            ),
        );
    }

    #fill(layer: ViewLayer, c: schematic_items.Circle) {
        const color = this.determine_fill(layer, c);

        if (!color) {
            return;
        }

        this.gfx.circle(new Circle(c.center, c.radius, color));
    }
}

class ArcPainter extends SchematicItemPainter {
    classes = [schematic_items.Arc];

    layers_for(item: schematic_items.Arc) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, a: schematic_items.Arc) {
        const arc = MathArc.from_three_points(
            a.start,
            a.mid,
            a.end,
            a.stroke?.width,
        );

        this.#fill(layer, a, arc);
        this.#stroke(layer, a, arc);
    }

    #stroke(layer: ViewLayer, a: schematic_items.Arc, arc: MathArc) {
        const { width, color } = this.determine_stroke(layer, a);

        if (!width || !color) {
            return;
        }

        this.gfx.arc(
            new Arc(
                arc.center,
                arc.radius,
                arc.start_angle,
                arc.end_angle,
                width,
                color,
            ),
        );
    }

    #fill(layer: ViewLayer, a: schematic_items.Arc, arc: MathArc) {
        const color = this.determine_fill(layer, a);

        if (!color) {
            return;
        }

        this.gfx.polygon(new Polygon(arc.to_polygon(), color));
    }
}

class JunctionPainter extends SchematicItemPainter {
    classes = [schematic_items.Junction];

    layers_for(item: schematic_items.Junction) {
        return [LayerNames.junction];
    }

    paint(layer: ViewLayer, j: schematic_items.Junction) {
        const color = this.theme.junction;
        const diameter =
            j.diameter || schematic_items.DefaultValues.junction_diameter;
        this.gfx.circle(new Circle(j.at.position, diameter / 2, color));
    }
}

class NoConnectPainter extends SchematicItemPainter {
    classes = [schematic_items.NoConnect];

    layers_for(item: schematic_items.NoConnect) {
        return [LayerNames.junction];
    }

    paint(layer: ViewLayer, nc: schematic_items.NoConnect): void {
        const color = this.theme.no_connect;
        const width = schematic_items.DefaultValues.line_width;
        const size = schematic_items.DefaultValues.noconnect_size / 2;

        this.gfx.state.push();
        this.gfx.state.matrix.translate_self(
            nc.at.position.x,
            nc.at.position.y,
        );

        this.gfx.line(
            new Polyline(
                [new Vec2(-size, -size), new Vec2(size, size)],
                width,
                color,
            ),
        );

        this.gfx.line(
            new Polyline(
                [new Vec2(size, -size), new Vec2(-size, size)],
                width,
                color,
            ),
        );

        this.gfx.state.pop();
    }
}

class TextPainter extends SchematicItemPainter {
    classes = [schematic_items.Text];

    layers_for(item: schematic_items.Text) {
        return [LayerNames.notes];
    }

    paint(layer: ViewLayer, t: schematic_items.Text) {
        if (t.effects.hide || !t.text) {
            return;
        }

        const schtext = new SchText(t.shown_text);

        schtext.apply_at(t.at);
        schtext.apply_effects(t.effects);
        schtext.attributes.stroke_width = text_pen(t.effects) * 10000;

        const font_color = t.effects.font.color;
        if (font_color.is_transparent_black) {
            // The color was not specified.
            const text_color = this.theme.note;
            schtext.attributes.color = this.dim_if_needed(text_color);
        } else {
            schtext.attributes.color = this.dim_if_needed(font_color);
        }

        // kicad-cli 9 draws a text item 0.25mm up the page from its anchor
        // at every angle and justification (18 justification x angle cases
        // at three sizes).
        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            schtext.shown_text,
            schtext.text_pos.add(new Vec2(0, -0.25 * 10000)),
            schtext.attributes,
        );
        this.gfx.state.pop();
    }
}

/** A field's text placement, and the box around its text for hit testing. */
export type FieldPlacement = TextPlacement & { box_center: Vec2; size: Vec2 };

/**
 * Places a field. Measured with kicad-cli 9 on fields of each justification
 * at 0 and 90 degrees on a symbol at every rotation and mirror, on netclass
 * flags and on sheets, over text sizes 0.8-3mm and thicknesses.
 *
 * A field's (at) is used on the page as written. A label's or sheet's field
 * is anchored there with its own angle and justification. A symbol's field
 * instead has its justification set a box of the text's size against that
 * point as the unrotated symbol has it; the box turns and mirrors with the
 * symbol, and the text is drawn upright, centred in the box. The box is the
 * text's box (see text_box()): measured as the advance width + 3t wide and
 * 0.83s + 2.49t tall (s the text height, t the text thickness), sitting
 * further along by the italic slant for centred and right-justified text.
 */
export function field_placement(
    field: schematic_items.Property,
    text: string,
    transform?: SymbolTransform,
): FieldPlacement {
    const effects = field.effects;
    const box = text_box(text, effects);
    const { x: width, y: height } = box.size;

    // The symbol's orientation on the page, without its library y flip.
    const orient = (v: Vec2) =>
        transform ? transform.matrix.transform(new Vec2(v.x, -v.y)) : v;

    const quarter = ((Math.round(field.at.rotation / 90) % 4) + 4) % 4;
    const reading = new Vec2([1, 0, -1, 0][quarter]!, [0, -1, 0, 1][quarter]!);
    const down = new Vec2(-reading.y, reading.x);

    const { horizontal, vertical } = effects.justify;
    const along = { left: 1, center: 0, right: -1 }[horizontal];
    const across = { top: 1, center: 0, bottom: -1 }[vertical];
    const box_center = field.at.position.add(
        orient(
            reading
                .multiply((along * width + (1 - along) * box.slant) / 2)
                .add(down.multiply((across * height) / 2)),
        ),
    );

    const drawn = orient(reading);
    const angle = Math.abs(drawn.x) >= Math.abs(drawn.y) ? 0 : 90;
    const size = angle == 0 ? new Vec2(width, height) : new Vec2(height, width);

    if (!transform) {
        return {
            position: field.at.position,
            angle,
            h_align: horizontal,
            v_align: vertical,
            box_center,
            size,
        };
    }

    return {
        position: box_center,
        angle,
        h_align: "center",
        v_align: "center",
        box_center,
        size,
    };
}

class PropertyPainter extends SchematicItemPainter {
    classes = [schematic_items.Property];

    layers_for(item: schematic_items.Property) {
        return [LayerNames.symbol_field, LayerNames.interactive];
    }

    paint(layer: ViewLayer, p: schematic_items.Property) {
        if (p.hide || !p.text) {
            return;
        }

        let color = this.theme.fields;
        if (p.parent instanceof schematic_items.SchematicSheet) {
            color = this.theme.sheet_fields;
        }

        const font_color = p.effects.font.color;
        if (font_color.is_transparent_black) {
            // The color was not specified.
            switch (p.name) {
                case "Reference":
                    color = this.theme.reference;
                    break;
                case "Value":
                    color = this.theme.value;
                    break;
                case "Sheet name":
                    color = this.theme.sheet_name;
                    break;
                case "Sheet file":
                    color = this.theme.sheet_filename;
                    break;
            }

            color = this.dim_if_needed(color);
        } else {
            color = this.dim_if_needed(font_color);
        }

        const parent = p.parent;
        const symbol =
            parent instanceof schematic_items.SchematicSymbol
                ? parent
                : undefined;

        let text = p.shown_text;

        // A field whose text is "~" is empty.
        if (text == "~") {
            return;
        }

        if (p.name == "Reference" && symbol?.unit) {
            text += symbol.unit_suffix;
        }

        const placement = field_placement(
            p,
            text,
            symbol ? this.view_painter.current_symbol_transform : undefined,
        );

        if (layer.name == LayerNames.interactive) {
            // Drawing text is expensive, just draw the bbox for the interactive layer.
            const { x, y } = placement.box_center;
            const { x: w, y: h } = placement.size;
            const box = new BBox(x - w / 2, y - h / 2, w, h);
            this.gfx.line(Polyline.from_BBox(box, 0.1, Color.white));
        } else {
            this.draw_text(text, p.effects, placement, color);
        }
    }
}

class LibTextPainter extends SchematicItemPainter {
    classes = [schematic_items.LibText];

    layers_for(item: schematic_items.LibText) {
        return [LayerNames.symbol_foreground];
    }

    paint(layer: ViewLayer, lt: schematic_items.LibText) {
        if (lt.effects.hide || !lt.text) {
            return;
        }

        const current_symbol_transform =
            this.view_painter.current_symbol_transform!;

        const libtext = new LibText(lt.shown_text);

        libtext.apply_effects(lt.effects);
        libtext.attributes.stroke_width = text_pen(lt.effects) * 10000;
        libtext.apply_at(lt.at);
        libtext.apply_symbol_transformations(current_symbol_transform);

        libtext.attributes.color = this.dim_if_needed(
            this.theme.component_outline,
        );

        // This gets the absolute world coordinates where the text should
        // be drawn.
        const pos = libtext.world_pos;

        // world_pos already applies v_align, so set it to center to draw
        // the text in the right spot.
        // Note: I'm not sure why it doesn't clear h_align like SchField
        // does.
        libtext.attributes.v_align = "center";

        this.gfx.state.push();
        this.gfx.state.matrix = Matrix3.identity();

        StrokeFont.default().draw(
            this.gfx,
            libtext.shown_text,
            pos,
            libtext.attributes,
        );

        // this.paint_debug(bbox);

        this.gfx.state.pop();
    }

    paint_debug(bbox: BBox) {
        this.gfx.line(
            Polyline.from_BBox(
                bbox.scale(1 / 10000),
                0.127,
                new Color(0, 0, 1, 1),
            ),
        );

        this.gfx.circle(
            new Circle(
                bbox.center.multiply(1 / 10000),
                0.2,
                new Color(0, 1, 0, 1),
            ),
        );
    }
}

class SchematicSheetPainter extends SchematicItemPainter {
    classes = [schematic_items.SchematicSheet];

    layers_for(item: schematic_items.SchematicSheet) {
        return [
            LayerNames.interactive,
            LayerNames.label,
            LayerNames.symbol_foreground,
            LayerNames.symbol_background,
            LayerNames.symbol_field,
        ];
    }

    paint(layer: ViewLayer, ss: schematic_items.SchematicSheet) {
        const outline_color = this.theme.sheet;
        const fill_color = this.theme.sheet_background;
        const bbox = new BBox(
            ss.at.position.x,
            ss.at.position.y,
            ss.size.x,
            ss.size.y,
        );

        if (layer.name == LayerNames.interactive) {
            this.gfx.polygon(Polygon.from_BBox(bbox.grow(3), fill_color));
        }

        if (layer.name == LayerNames.symbol_background) {
            this.gfx.polygon(Polygon.from_BBox(bbox, fill_color));
        }

        if (layer.name == LayerNames.symbol_foreground) {
            this.gfx.line(
                Polyline.from_BBox(
                    bbox,
                    this.gfx.state.stroke_width,
                    outline_color,
                ),
            );
        }

        if (layer.name == LayerNames.symbol_field) {
            for (const property of ss.properties.values()) {
                this.view_painter.paint_item(layer, property);
            }
        }

        if (layer.name == LayerNames.label) {
            // kicad-cli draws a sheet pin as a hierarchical label pointing
            // into the sheet: half a turn from the pin's (at) angle, with
            // input and output swapped.
            for (const pin of ss.pins) {
                const label = new schematic_items.HierarchicalLabel();
                label.at = pin.at.copy();
                label.at.rotation = (pin.at.rotation + 180) % 360;
                label.effects = pin.effects;
                label.text = pin.name;
                label.shape =
                    pin.shape == "input"
                        ? "output"
                        : pin.shape == "output"
                          ? "input"
                          : pin.shape;

                this.view_painter.paint_item(layer, label);
            }
        }
    }
}

export class SchematicPainter extends BaseSchematicPainter {
    override theme: SchematicTheme;

    constructor(gfx: Renderer, layers: LayerSet, theme: SchematicTheme) {
        super(gfx, layers, theme);
        this.painter_list = [
            new RectanglePainter(this, gfx),
            new PolylinePainter(this, gfx),
            new RuleAreaPainter(this, gfx),
            new WirePainter(this, gfx),
            new BusPainter(this, gfx),
            new BusEntryPainter(this, gfx),
            new CirclePainter(this, gfx),
            new ArcPainter(this, gfx),
            new JunctionPainter(this, gfx),
            new NoConnectPainter(this, gfx),
            new TextPainter(this, gfx),
            new LibTextPainter(this, gfx),
            new PinPainter(this, gfx),
            new LibSymbolPainter(this, gfx),
            new PropertyPainter(this, gfx),
            new SchematicSymbolPainter(this, gfx),
            new NetLabelPainter(this, gfx),
            new DirectiveLabelPainter(this, gfx),
            new GlobalLabelPainter(this, gfx),
            new HierarchicalLabelPainter(this, gfx),
            new SchematicSheetPainter(this, gfx),
        ];
    }
}
