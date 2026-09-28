/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Logger } from "../../base/log";
import type { Vec2 } from "../../base/math";
import { Renderer } from "../../graphics";
import type { BaseTheme } from "../../kicad";
import { StrokeParams } from "../../kicad/common";
import { ViewLayer, ViewLayerSet } from "./view-layers";

const log = new Logger("kicanvas:project");

/**
 * Base class for all painters responsible for drawing view items.
 */
export abstract class ItemPainter {
    /**
     * List of item classes this painter can draw
     */
    abstract classes: unknown[];

    constructor(
        protected view_painter: DocumentPainter,
        protected gfx: Renderer,
    ) {}

    abstract layers_for(item: unknown): string[];

    abstract paint(layer: ViewLayer, item: unknown, ...rest: any[]): void;

    public get theme(): BaseTheme {
        return this.view_painter.theme;
    }
}

export interface PaintableDocument {
    items(): Generator<unknown, void, void>;
}

/**
 * Base class for painting a complete document, for example an entire schematic or board.
 */
export class DocumentPainter {
    #painters: Map<unknown, ItemPainter> = new Map();

    /**
     * Create a ViewPainter.
     */
    constructor(
        public gfx: Renderer,
        public layers: ViewLayerSet,
        public theme: BaseTheme,
    ) {}

    protected set painter_list(painters: ItemPainter[]) {
        for (const painter of painters) {
            for (const type of painter.classes) {
                this.#painters.set(type, painter);
            }
        }
    }

    get painters(): Map<unknown, ItemPainter> {
        return this.#painters;
    }

    paint(document: PaintableDocument) {
        log.debug("Painting");

        log.debug("Sorting paintable items into layers");

        for (const item of document.items()) {
            const painter = this.painter_for(item);

            if (!painter) {
                log.warn(`No painter found for ${item?.constructor.name}`);
                continue;
            }

            for (const layer_name of painter.layers_for(item)) {
                this.layers.by_name(layer_name)?.items.push(item);
            }
        }

        for (const layer of this.paintable_layers()) {
            log.debug(
                `Painting layer ${layer.name} with ${layer.items.length} items`,
            );
            this.paint_layer(layer);
        }

        log.debug("Painting complete");
    }

    *paintable_layers() {
        yield* this.layers.in_display_order();
    }

    paint_layer(layer: ViewLayer) {
        const bboxes = new Map();

        this.gfx.start_layer(layer.name);

        for (const item of layer.items) {
            this.gfx.start_bbox();

            this.paint_item(layer, item);

            const bbox = this.gfx.end_bbox(item);
            bboxes.set(item, bbox);
        }

        layer.graphics = this.gfx.end_layer();
        layer.bboxes = bboxes;
    }

    paint_item(layer: ViewLayer, item: unknown, ...rest: any[]) {
        const painter = this.painter_for(item);
        painter?.paint(layer, item, ...rest);
    }

    painter_for(item: any): ItemPainter | undefined {
        return this.painters.get(item.constructor);
    }

    layers_for(item: any): string[] {
        return this.painters.get(item.constructor)?.layers_for(item) || [];
    }
}

/**
 * Stroke painter (solid, dash, etc.)
 */
export class StrokePainter {
    /**
     * Draw polyline `lines` in `stroke_style`, handing each solid run to
     * `draw_line`. A patterned stroke starts its pattern afresh on every side
     * of the polyline, and a piece running past a side's end is cut short
     * there, as kicad-cli 9's board SVG draws dashed lines, rectangles and
     * polygons.
     */
    static line(
        lines: Vec2[],
        width: number,
        stroke_style: StrokeParams,
        draw_line: (lines: Vec2[]) => void,
    ) {
        const pattern = StrokePainter.pattern(width, stroke_style);
        // A zero width gives zero-length pieces: draw such a stroke solid.
        if (!pattern || !(width > 0)) {
            draw_line(lines);
            return;
        }

        for (let i = 1; i < lines.length; i++) {
            const from = lines[i - 1]!;
            const side = lines[i]!.sub(from);
            const length = side.magnitude;
            if (length == 0) {
                continue;
            }
            const along = (t: number) => from.add(side.multiply(t / length));
            let at = 0;
            for (let k = 0; at < length; k = (k + 1) % pattern.length) {
                const to = Math.min(at + pattern[k]!, length);
                // Even entries are drawn, odd ones are gaps.
                if (k % 2 == 0) {
                    draw_line([along(at), along(to)]);
                }
                at = to;
            }
        }
    }

    /** The drawn and skipped lengths a patterned stroke repeats; null when it is solid. */
    private static pattern(
        width: number,
        style: StrokeParams,
    ): number[] | null {
        const dash = StrokeParams.dash_length(width, style);
        const gap = StrokeParams.gap_length(width, style);
        const dot = StrokeParams.dot_length(width);
        switch (style.stroke.type) {
            case "dash":
                return [dash, gap];
            case "dot":
                return [dot, gap];
            case "dash_dot":
                return [dash, gap, dot, gap];
            case "dash_dot_dot":
                return [dash, gap, dot, gap, dot, gap];
            default:
                return null;
        }
    }
}
