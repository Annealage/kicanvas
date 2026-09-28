/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, Vec2 } from "../base/math";
import {
    Arc,
    Circle,
    Color,
    Polygon,
    Polyline,
    type RenderLayer,
} from "../graphics";
import type { WebGL2Renderer } from "../graphics/webgl";
import type { BoardTheme } from "../kicad";
import { BoardViewer } from "../viewers/board/viewer";
import type { ViewLayer } from "../viewers/board/layers";

export type XY = [number, number];

/** A highlight shape in board mm. `colour` overrides the call's colour. */
export type Shape =
    | {
          kind: "seg";
          a: XY;
          b: XY;
          w?: number;
          layer?: string;
          colour?: string;
      }
    | { kind: "circle"; c: XY; r: number; layer?: string; colour?: string }
    | { kind: "box"; box: [number, number, number, number]; colour?: string }
    | { kind: "poly"; pts: XY[]; colour?: string };

// On-screen minimums, so highlights stay visible when zoomed out.
const STROKE_PX = 2;
const MIN_SEG_PX = 3;
const MIN_RADIUS_PX = 4;
// Fill alpha relative to the stroke, and the dimming for a shape whose layer
// is hidden.
const FILL_ALPHA = 0.22;
const HIDDEN_LAYER_ALPHA = 0.35;
// Everything but the selected net is drawn at this alpha.
const NET_DIM_ALPHA = 0.3;
// The zoom-dependent part of a highlight (strokes, and the on-screen minimum
// sizes) is repainted when the zoom has changed by more than this factor
// since it was painted, not on every wheel step: a large highlight (a ground
// island with its pours) costs a few hundred ms to tessellate.
const HIGHLIGHT_ZOOM_STEP = 1.25;

/**
 * BoardViewer driven by BoardView.
 *
 * It isn't "interactive" in KiCanvas's sense (BoardView owns pointer input),
 * redraws on every camera change, coalesces draws into one per frame, shows
 * a selected net KiCad-style, and renders highlight shapes above everything
 * with on-screen minimum sizes.
 */
export class FacadeViewer extends BoardViewer {
    /** Number of the net shown as the selection, or null. */
    selected_net: number | null = null;
    /** Runs after every full repaint (load, flip) to re-apply view state. */
    after_paint: () => void = () => {};
    /** Runs once per drawn frame in which the camera changed. */
    on_view: () => void = () => {};
    /** Whether a board layer is visible, for dimming highlight shapes. */
    layer_visible: (name: string) => boolean = () => true;

    #frame = 0;
    #last_view = "";
    #shapes: Shape[] = [];
    #colour = Color.white;
    // Polygon and box fills, which don't depend on the zoom, painted when
    // the shapes or the layer visibility change; then the zoom-dependent
    // circle fills and all strokes, painted at #highlight_zoom.
    #highlight_fills: RenderLayer[] = [];
    #highlight: RenderLayer[] = [];
    #highlight_zoom = 0;
    #net_layers: { layer: ViewLayer; graphics: RenderLayer }[] = [];

    constructor(canvas: HTMLCanvasElement, theme: BoardTheme) {
        super(canvas, false, theme);
    }

    override dispose() {
        window.cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        this.#clear_highlight_layers();
        this.#clear_net_layers();
        super.dispose();
    }

    override paint() {
        super.paint();
        if (!this.document) {
            return;
        }
        this.after_paint();
        this.paint_selected();
    }

    protected override on_viewport_change() {
        this.draw();
    }

    override draw() {
        if (!this.viewport || this.#frame) {
            return;
        }
        this.#frame = window.requestAnimationFrame(() => {
            this.#frame = 0;
            this.on_draw();
            const cam = this.viewport.camera;
            const view = [
                cam.center.x,
                cam.center.y,
                cam.zoom,
                cam.flipped,
                cam.viewport_size.x,
                cam.viewport_size.y,
            ].join();
            if (view != this.#last_view) {
                this.#last_view = view;
                this.on_view();
            }
        });
    }

    /**
     * A footprint selection is KiCanvas's box on the overlay. A net selection
     * repaints the net's items per view layer in their own colours; on_draw
     * dims everything else under them, as KiCad's net highlight does.
     */
    protected override paint_selected() {
        this.#clear_net_layers();
        if (this.selected_net === null || !this.document) {
            super.paint_selected();
            return;
        }
        this.layers.overlay.clear();

        const painter = this.painter;
        painter.filter_net = this.selected_net;
        for (const layer of this.layers.in_display_order()) {
            if (!layer.items.length || layer == this.layers.overlay) {
                continue;
            }
            this.renderer.start_layer(`:Net${layer.name}`);
            for (const item of layer.items) {
                painter.paint_item(layer, item);
            }
            this.#net_layers.push({
                layer,
                graphics: this.renderer.end_layer(),
            });
        }
        painter.filter_net = null;
        this.draw();
    }

    #clear_net_layers() {
        for (const { graphics } of this.#net_layers) {
            graphics.dispose();
        }
        this.#net_layers = [];
    }

    set_highlight(shapes: Shape[], colour: Color) {
        this.#shapes = shapes;
        this.#colour = colour;
        this.invalidate_highlight();
    }

    /** Repaint the highlight on the next frame (the shapes or visibility changed). */
    invalidate_highlight() {
        this.#clear_highlight_layers();
        this.#highlight_zoom = 0;
        this.draw();
    }

    protected override on_draw() {
        const zoom = this.viewport.camera.zoom;
        const step = zoom / this.#highlight_zoom;
        if (
            !this.#highlight_zoom ||
            step > HIGHLIGHT_ZOOM_STEP ||
            step < 1 / HIGHLIGHT_ZOOM_STEP
        ) {
            this.#paint_highlight(zoom);
        }

        this.renderer.clear_canvas();
        if (!this.layers) {
            return;
        }

        // Viewer.on_draw, plus the dimming under a selected net. Each layer
        // renders at a greater depth than the last with a GREATER depth test,
        // so overlapping shapes within one layer don't stack their alpha.
        const matrix = this.viewport.camera.matrix;
        const dim_layers = this.layers.is_any_layer_highlighted();
        const dim_net = this.#net_layers.length > 0;
        let depth = 0.01;
        for (const layer of this.layers.in_display_order()) {
            if (!layer.visible || !layer.graphics) {
                continue;
            }
            let alpha = layer.opacity ?? 1;
            if (dim_layers && !layer.highlighted) {
                alpha = 0.25;
            }
            if (dim_net && layer != this.layers.overlay) {
                alpha *= NET_DIM_ALPHA;
            }
            layer.graphics.render(matrix, depth, alpha);
            depth += 0.01;
        }
        for (const { layer, graphics } of this.#net_layers) {
            if (layer.visible) {
                graphics.render(matrix, depth, layer.opacity ?? 1);
                depth += 0.01;
            }
        }

        const layers = [...this.#highlight_fills, ...this.#highlight];
        if (!layers.length) {
            return;
        }
        // Start the highlight over everything with a fresh depth buffer.
        // Fills and strokes are separate layers so a stroke isn't
        // depth-rejected where it overlaps its own fill.
        const gl = (this.renderer as WebGL2Renderer).gl!;
        gl.clear(gl.DEPTH_BUFFER_BIT);
        layers.forEach((layer, i) => layer.render(matrix, 0.5 + i * 0.1));
    }

    #clear_highlight_layers() {
        for (const layer of [...this.#highlight_fills, ...this.#highlight]) {
            layer.dispose();
        }
        this.#highlight_fills = [];
        this.#highlight = [];
    }

    #paint_highlight(zoom: number) {
        for (const layer of this.#highlight) {
            layer.dispose();
        }
        this.#highlight = [];
        this.#highlight_zoom = zoom;
        if (!this.#shapes.length) {
            return;
        }

        const paint_fills = !this.#highlight_fills.length;
        const px = 1 / zoom;
        const stroke_w = STROKE_PX * px;
        const fixed_fills: (() => void)[] = [];
        const fills: (() => void)[] = [];
        const strokes: (() => void)[] = [];

        for (const shape of this.#shapes) {
            let colour = shape.colour
                ? Color.from_css(shape.colour)
                : this.#colour;
            if (
                "layer" in shape &&
                shape.layer &&
                !this.layer_visible(shape.layer)
            ) {
                colour = colour.with_alpha(colour.a * HIDDEN_LAYER_ALPHA);
            }
            const fill = colour.with_alpha(colour.a * FILL_ALPHA);

            switch (shape.kind) {
                case "seg": {
                    const w = Math.max(shape.w ?? 0, MIN_SEG_PX * px);
                    const pts = [new Vec2(...shape.a), new Vec2(...shape.b)];
                    strokes.push(() =>
                        this.renderer.line(new Polyline(pts, w, colour)),
                    );
                    break;
                }
                case "circle": {
                    const c = new Vec2(...shape.c);
                    const r = Math.max(shape.r, MIN_RADIUS_PX * px);
                    fills.push(() =>
                        this.renderer.circle(new Circle(c, r, fill)),
                    );
                    strokes.push(() =>
                        this.renderer.arc(
                            new Arc(
                                c,
                                r,
                                new Angle(0),
                                new Angle(2 * Math.PI),
                                stroke_w,
                                colour,
                            ),
                        ),
                    );
                    break;
                }
                case "box":
                case "poly": {
                    let pts: Vec2[];
                    if (shape.kind == "box") {
                        const [x0, y0, x1, y1] = shape.box;
                        pts = [
                            new Vec2(x0, y0),
                            new Vec2(x1, y0),
                            new Vec2(x1, y1),
                            new Vec2(x0, y1),
                        ];
                    } else {
                        pts = shape.pts.map((p) => new Vec2(...p));
                    }
                    if (pts.length < 2) {
                        break;
                    }
                    const closed = [...pts, pts[0]!];
                    if (pts.length > 2 && paint_fills) {
                        fixed_fills.push(() =>
                            this.renderer.polygon(new Polygon(pts, fill)),
                        );
                    }
                    strokes.push(() =>
                        this.renderer.line(
                            new Polyline(closed, stroke_w, colour),
                        ),
                    );
                    break;
                }
            }
        }

        if (paint_fills) {
            this.renderer.start_layer(":Highlight:Area");
            for (const draw of fixed_fills) {
                draw();
            }
            this.#highlight_fills.push(this.renderer.end_layer());
        }
        for (const [name, paint] of [
            [":Highlight:Fill", fills],
            [":Highlight:Stroke", strokes],
        ] as const) {
            this.renderer.start_layer(name);
            for (const draw of paint) {
                draw();
            }
            this.#highlight.push(this.renderer.end_layer());
        }
    }
}
