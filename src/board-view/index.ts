/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * BoardView: KiCanvas's board renderer on a caller's canvas, without
 * KiCanvas's UI elements or fonts. Built as build/kicanvas-board.js.
 *
 * Coordinates are board mm in KiCad's frame (+Y down); screen positions are
 * CSS px relative to the canvas.
 */

import { BBox, Vec2 } from "../base/math";
import { Color } from "../graphics";
import { KicadPCB } from "../kicad";
import type { BoardTheme, Theme } from "../kicad/theme";
import themes from "../kicanvas/themes";
import { LayerNames, type ViewLayer } from "../viewers/board/layers";
import { PointerControls } from "./controls";
import { pick, type PickItem } from "./pick";
import { FacadeViewer, type Shape, type XY } from "./viewer";

export type { PickItem, Shape, XY };

export type LayerKind =
    | "copper"
    | "silk"
    | "mask"
    | "paste"
    | "fab"
    | "courtyard"
    | "edge"
    | "user"
    | "virtual";

export interface LayerInfo {
    /** KiCad's canonical name ("F.SilkS"), or a virtual group name. */
    name: string;
    /** The board's own name for the layer ("F.Silkscreen"), else `name`. */
    label: string;
    kind: LayerKind;
    visible: boolean;
    /** "#rrggbb" */
    colour: string;
}

export type Preset = "top" | "bottom" | "copper" | "inner" | "all";

export type Selection =
    | { kind: "footprint"; ref: string }
    | { kind: "net"; net: string }
    | null;

export interface Opacity {
    tracks?: number;
    vias?: number;
    zones?: number;
    pads?: number;
    holes?: number;
}

export interface ClickEvent {
    /** Board mm under the click. */
    x: number;
    y: number;
    /** CSS px in the canvas. */
    px: number;
    py: number;
    items: PickItem[];
    button: number;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    /** Skip the selection this click would make. */
    preventDefault(): void;
    readonly defaultPrevented: boolean;
}

export interface BoardViewEvents {
    select: Selection;
    pointer: { x: number; y: number };
    view: void;
    click: ClickEvent;
}

export interface BoardViewOptions {
    /** A name from THEMES, a Theme, or a board theme. Default "annealage". */
    theme?: string | Theme | BoardTheme;
}

/** KiCanvas's themes by name ("annealage", "annealage-light", "kicad", "witchhazel"). */
export const THEMES: Record<string, Theme> = Object.fromEntries(
    themes.list().map((t) => [t.name, t]),
);

/** Virtual layer groups, toggled like layers. */
const GROUPS = ["Pads", "Vias", "Holes", "Zones"] as const;
type Group = (typeof GROUPS)[number];

// A click within this many px of a thin item (track, via, pad) hits it.
const PICK_TOLERANCE_PX = 3;
// zoomToBoard's margin around the outline, as a fraction of its larger side.
const FIT_MARGIN = 0.04;
const DEFAULT_HIGHLIGHT = "#ff4fd8";

function group_of(view_layer: string): Group | null {
    switch (view_layer) {
        case LayerNames.pads_front:
        case LayerNames.pads_back:
        case LayerNames.pads_front_netname:
        case LayerNames.pads_back_netname:
            return "Pads";
        case LayerNames.via_holes:
        case LayerNames.via_holewalls:
            return "Vias";
        case LayerNames.pad_holes:
        case LayerNames.pad_holewalls:
        case LayerNames.pad_holes_netname:
        case LayerNames.non_plated_holes:
            return "Holes";
    }
    if (view_layer.endsWith(":Zones")) {
        return "Zones";
    }
    if (
        view_layer.endsWith(":BBViaHoles") ||
        view_layer.endsWith(":BBViaHoleWalls")
    ) {
        return "Vias";
    }
    return null;
}

function kind_of(name: string): LayerKind {
    if (name.endsWith(".Cu")) return "copper";
    if (name.endsWith(".SilkS")) return "silk";
    if (name.endsWith(".Mask")) return "mask";
    if (name.endsWith(".Paste")) return "paste";
    if (name.endsWith(".Fab")) return "fab";
    if (name.endsWith(".CrtYd")) return "courtyard";
    if (name == LayerNames.edge_cuts) return "edge";
    return "user";
}

const PRESETS: Record<Preset, (name: string) => boolean> = {
    top: (n) =>
        ["F.Cu", "F.SilkS", "F.CrtYd", LayerNames.edge_cuts].includes(n),
    bottom: (n) =>
        ["B.Cu", "B.SilkS", "B.CrtYd", LayerNames.edge_cuts].includes(n),
    copper: (n) => n.endsWith(".Cu") || n == LayerNames.edge_cuts,
    inner: (n) => /^In\d+\.Cu$/.test(n) || n == LayerNames.edge_cuts,
    all: () => true,
};

/** Before any toggle: everything but masks, paste, adhesive, fab and margin. */
function default_visible(name: string) {
    const kind = kind_of(name);
    return !(
        kind == "mask" ||
        kind == "paste" ||
        kind == "fab" ||
        name.endsWith(".Adhes") ||
        name == LayerNames.margin
    );
}

function hex(c: Color) {
    return `#${[c.r_255, c.g_255, c.b_255]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;
}

function resolve_theme(theme: BoardViewOptions["theme"]): BoardTheme {
    if (theme === undefined || typeof theme == "string") {
        const name = theme ?? "annealage";
        const found = THEMES[name];
        if (!found) {
            throw new Error(`Unknown KiCanvas theme "${name}"`);
        }
        return found.board;
    }
    return "board" in theme ? theme.board : theme;
}

type Handler<K extends keyof BoardViewEvents> = (
    payload: BoardViewEvents[K],
) => void;

type HandlerSets = { [K in keyof BoardViewEvents]: Set<Handler<K>> };

export class BoardView {
    readonly canvas: HTMLCanvasElement;

    #viewer: FacadeViewer;
    #setup: Promise<void>;
    #controls: PointerControls;
    #board: KicadPCB | null = null;
    #handlers: HandlerSets = {
        select: new Set(),
        pointer: new Set(),
        view: new Set(),
        click: new Set(),
    };

    #layer_visible = new Map<string, boolean>();
    #group_visible: Record<Group, boolean> = {
        Pads: true,
        Vias: true,
        Holes: true,
        Zones: true,
    };
    #opacity: Required<Opacity> = {
        tracks: 1,
        vias: 1,
        zones: 1,
        pads: 1,
        holes: 1,
    };
    #selection: Selection = null;
    // Fit the camera once the canvas has a size: "board", a box, or nothing.
    #pending_fit: BBox | "board" | null = null;
    #fitted = false;
    #want_flipped = false;

    constructor(canvas: HTMLCanvasElement, options: BoardViewOptions = {}) {
        this.canvas = canvas;
        canvas.style.touchAction = "none";

        const viewer = new FacadeViewer(canvas, resolve_theme(options.theme));
        this.#viewer = viewer;
        viewer.after_paint = () => this.#apply_view_state();
        viewer.on_view = () => this.#emit("view", undefined);
        viewer.layer_visible = (name) =>
            viewer.layers?.by_name(name)?.visible ?? false;

        this.#setup = viewer.setup().then(() => {
            viewer.viewport.ready.then(() => this.#fit_pending());
        });
        // load() reports a setup failure (no WebGL2); don't also report it
        // as unhandled here.
        this.#setup.catch(() => {});

        this.#controls = new PointerControls(canvas, {
            camera: () => viewer.viewport?.camera ?? null,
            changed: () => viewer.draw(),
            click: (p, e) => this.#click(p, e),
            hover: (p) => {
                if (viewer.viewport?.ready.isOpen) {
                    const w = viewer.viewport.camera.screen_to_world(p);
                    this.#emit("pointer", { x: w.x, y: w.y });
                }
            },
        });
    }

    /**
     * Show a board from the text of a .kicad_pcb. The first load fits the
     * board; later loads keep the camera, layer visibility, opacity and the
     * selection (while its footprint or net still exists).
     */
    async load(text: string, name = "board.kicad_pcb"): Promise<void> {
        const board = new KicadPCB(name, text);
        await this.#setup;

        const viewer = this.#viewer;
        const sel = this.#selection;
        const fp =
            sel?.kind == "footprint" ? board.find_footprint(sel.ref) : null;
        const net =
            sel?.kind == "net" ? this.#net_number(board, sel.net) : null;

        this.#board = board;
        viewer.document = board;
        viewer.selected_net = net;
        viewer.selected = fp?.bbox ?? null;
        viewer.paint();

        if (this.#want_flipped != viewer.viewport.camera.flipped) {
            viewer.flip_view();
        }
        if (!this.#fitted) {
            this.#fitted = true;
            this.#pending_fit ??= "board";
            this.#fit_pending();
        }
        viewer.draw();

        if (sel && !fp && net === null) {
            this.#selection = null;
            this.#emit("select", null);
        }
    }

    /** Board layers (KiCad names, UI order) then the virtual groups. */
    layers(): LayerInfo[] {
        const view_layers = this.#viewer.layers;
        if (!this.#board || !view_layers) {
            return [];
        }
        const labels = new Map(
            this.#board.layers.map((l) => [
                l.canonical_name,
                l.user_name ?? l.canonical_name,
            ]),
        );
        const physical: LayerInfo[] = [...view_layers.in_ui_order()].map(
            (l: ViewLayer) => ({
                name: l.name,
                label: labels.get(l.name) ?? l.name,
                kind: kind_of(l.name),
                visible: l.visible,
                colour: hex(l.color),
            }),
        );
        const theme = this.#viewer.theme;
        const group_colour: Record<Group, Color> = {
            Pads: theme.copper.f,
            Vias: theme.via_through,
            Holes: theme.pad_through_hole,
            Zones: theme.copper.f,
        };
        const groups: LayerInfo[] = GROUPS.map((g) => ({
            name: g,
            label: g,
            kind: "virtual",
            visible: this.#group_visible[g],
            colour: hex(group_colour[g]),
        }));
        return [...physical, ...groups];
    }

    setLayerVisible(name: string, visible: boolean) {
        this.setLayersVisible({ [name]: visible });
    }

    setLayersVisible(visibility: Record<string, boolean>) {
        for (const [name, visible] of Object.entries(visibility)) {
            if ((GROUPS as readonly string[]).includes(name)) {
                this.#group_visible[name as Group] = visible;
            } else {
                this.#layer_visible.set(name, visible);
                const layer = this.#viewer.layers?.by_name(name);
                if (layer && !name.startsWith(":")) {
                    layer.visible = visible;
                }
            }
        }
        this.#viewer.invalidate_highlight();
    }

    /** Show a set of layers: "top", "bottom", "copper", "inner" or "all". */
    preset(name: Preset) {
        const shows = PRESETS[name];
        if (!shows) {
            throw new Error(`Unknown layer preset "${name}"`);
        }
        const names = new Set<string>(
            Object.values(LayerNames).filter((n) => !n.startsWith(":")),
        );
        for (const l of this.#board?.layers ?? []) {
            names.add(l.canonical_name);
        }
        const visibility: Record<string, boolean> = {};
        for (const n of names) {
            visibility[n] = shows(n);
        }
        for (const g of GROUPS) {
            visibility[g] = true;
        }
        this.setLayersVisible(visibility);
    }

    /** Opacity 0..1 per kind of object; unspecified kinds keep theirs. */
    setOpacity(opacity: Opacity) {
        for (const [key, value] of Object.entries(opacity)) {
            if (key in this.#opacity && typeof value == "number") {
                this.#opacity[key as keyof Opacity] = Math.max(
                    0,
                    Math.min(1, value),
                );
            }
        }
        this.#apply_opacity();
        this.#viewer.draw();
    }

    /**
     * Select a footprint by reference or a net by name, or clear with null;
     * emits "select" like a click does. Returns false, changing nothing, when
     * no board is loaded or the reference or net isn't on it.
     */
    select(target: { ref: string } | { net: string } | null): boolean {
        const board = this.#board;
        const viewer = this.#viewer;
        if (!board) {
            return false;
        }

        let selection: Selection = null;
        if (target && "ref" in target) {
            const fp = board.find_footprint(target.ref);
            if (!fp) {
                return false;
            }
            viewer.selected_net = null;
            viewer.selected = fp.bbox;
            selection = { kind: "footprint", ref: fp.reference };
        } else if (target && "net" in target) {
            const net = this.#net_number(board, target.net);
            if (net === null) {
                return false;
            }
            viewer.selected_net = net;
            viewer.selected = null;
            selection = { kind: "net", net: target.net };
        } else {
            viewer.selected_net = null;
            viewer.selected = null;
        }

        this.#selection = selection;
        this.#emit("select", selection);
        return true;
    }

    /** The current selection. */
    get selection(): Selection {
        return this.#selection;
    }

    /**
     * Draw shapes (board mm) above the board in `colour` ("#rrggbb",
     * "#rrggbbaa" or rgb()/rgba()), replacing any earlier highlight. A shape
     * with a `layer` that's hidden is drawn faint.
     */
    highlight(shapes: Shape[], colour = DEFAULT_HIGHLIGHT) {
        this.#viewer.set_highlight(shapes, Color.from_css(colour));
    }

    clearHighlight() {
        this.#viewer.set_highlight([], Color.white);
    }

    /** Fit the board outline (Edge.Cuts), or everything without one. */
    zoomToBoard() {
        this.#pending_fit = "board";
        this.#fit_pending();
    }

    /** Fit a box [x0, y0, x1, y1] in board mm. */
    zoomTo(box: [number, number, number, number]) {
        const [x0, y0, x1, y1] = box;
        this.#pending_fit = BBox.from_corners(x0, y0, x1, y1);
        this.#fit_pending();
    }

    /** View from below (mirrored) or not; toggles without an argument. */
    flip(flipped?: boolean) {
        this.#want_flipped = flipped ?? !this.#want_flipped;
        const viewer = this.#viewer;
        if (
            this.#board &&
            viewer.viewport &&
            viewer.viewport.camera.flipped != this.#want_flipped
        ) {
            viewer.flip_view();
        }
    }

    get flipped(): boolean {
        return this.#want_flipped;
    }

    /**
     * Repaint in another theme (a name from THEMES, a Theme or a board
     * theme), as a reload does: camera, layer visibility, opacity, flip and
     * selection are kept. `layers()` reports the new colours afterwards.
     */
    setTheme(theme: BoardViewOptions["theme"]) {
        const viewer = this.#viewer;
        viewer.theme = resolve_theme(theme);
        if (this.#board && viewer.viewport) {
            viewer.paint();
            viewer.draw();
        }
    }

    worldToScreen([x, y]: XY): XY {
        const camera = this.#viewer.viewport?.camera;
        if (!camera) {
            return [NaN, NaN];
        }
        const p = camera.world_to_screen(new Vec2(x, y));
        return [p.x, p.y];
    }

    screenToWorld([px, py]: XY): XY {
        const camera = this.#viewer.viewport?.camera;
        if (!camera) {
            return [NaN, NaN];
        }
        const p = camera.screen_to_world(new Vec2(px, py));
        return [p.x, p.y];
    }

    /** Subscribe; returns the unsubscribe function. */
    on<K extends keyof BoardViewEvents>(type: K, handler: Handler<K>) {
        this.#handlers[type].add(handler);
        return () => this.off(type, handler);
    }

    off<K extends keyof BoardViewEvents>(type: K, handler: Handler<K>) {
        this.#handlers[type].delete(handler);
    }

    dispose() {
        this.#controls.dispose();
        this.#viewer.dispose();
        for (const set of Object.values(this.#handlers)) {
            set.clear();
        }
        this.#board = null;
    }

    #emit<K extends keyof BoardViewEvents>(
        type: K,
        payload: BoardViewEvents[K],
    ) {
        for (const handler of [...this.#handlers[type]]) {
            try {
                handler(payload);
            } catch (e) {
                // One handler's bug mustn't stop the others or the viewer.
                reportError(e);
            }
        }
    }

    #net_number(board: KicadPCB, name: string): number | null {
        // Net 0 is "no net"; the painter treats a 0 filter as "everything".
        const net = board.nets.find((n) => n.name == name);
        return net && net.number > 0 ? net.number : null;
    }

    #fit_pending() {
        const viewer = this.#viewer;
        const target = this.#pending_fit;
        if (!target || !this.#board || !viewer.viewport?.ready.isOpen) {
            return;
        }
        this.#pending_fit = null;

        let box = target;
        if (box == "board") {
            box =
                viewer.layers.by_name(LayerNames.edge_cuts)?.bbox ?? new BBox();
            if (!box.valid) {
                box = BBox.combine(this.#board.footprints.map((f) => f.bbox));
            }
            box = box.grow(Math.max(box.w, box.h) * FIT_MARGIN);
        }
        if (!box.valid) {
            return;
        }
        viewer.viewport.camera.bbox = box;
        viewer.draw();
    }

    #click(p: Vec2, e: PointerEvent) {
        const viewer = this.#viewer;
        const board = this.#board;
        if (!board || !viewer.viewport) {
            return;
        }
        const camera = viewer.viewport.camera;
        const w = camera.screen_to_world(p);
        const layers = viewer.layers;
        const items = pick(board, w, PICK_TOLERANCE_PX / camera.zoom, {
            layer: (name) => layers.by_name(name)?.visible ?? false,
            pads: this.#group_visible.Pads,
            vias: this.#group_visible.Vias,
            zones: this.#group_visible.Zones,
        });

        let prevented = false;
        this.#emit("click", {
            x: w.x,
            y: w.y,
            px: p.x,
            py: p.y,
            items,
            button: e.button,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            preventDefault: () => {
                prevented = true;
            },
            get defaultPrevented() {
                return prevented;
            },
        });
        if (prevented) {
            return;
        }

        // Pads and footprints select the part; tracks and vias their net;
        // zones never (a pour covers most of the board).
        const hit = items.find((i) => i.kind != "zone");
        if (!hit) {
            this.select(null);
        } else if (hit.kind == "pad" || hit.kind == "footprint") {
            this.select({ ref: hit.ref });
        } else if (!hit.net || !this.select({ net: hit.net })) {
            this.select(null);
        }
    }

    /** Re-apply visibility, groups and opacity to a fresh set of view layers. */
    #apply_view_state() {
        const layers = this.#viewer.layers;
        for (const layer of layers.in_order()) {
            const name = layer.name;
            if (name == LayerNames.drawing_sheet || name == LayerNames.grid) {
                layer.visible = false;
                continue;
            }
            if (!name.startsWith(":")) {
                layer.visible =
                    this.#layer_visible.get(name) ?? default_visible(name);
                continue;
            }
            const group = group_of(name);
            if (group) {
                const own = layer.visibility;
                layer.visible = () =>
                    this.#group_visible[group] &&
                    (typeof own == "function" ? own() : own);
            }
        }
        this.#apply_opacity();
    }

    #apply_opacity() {
        const layers = this.#viewer.layers;
        if (!layers) {
            return;
        }
        const o = this.#opacity;
        const sets: [Iterable<ViewLayer>, number][] = [
            [layers.copper_layers(), o.tracks],
            [layers.via_layers(), o.vias],
            [layers.zone_layers(), o.zones],
            [layers.pad_layers(), o.pads],
            [layers.pad_hole_layers(), o.holes],
        ];
        for (const [set, value] of sets) {
            for (const layer of set) {
                layer.opacity = value;
            }
        }
    }
}
