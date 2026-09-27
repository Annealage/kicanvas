/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Disposables, type IDisposable } from "../base/disposable";
import { listen } from "../base/events";
import { Vec2, type Camera2 } from "../base/math";

/** What PointerControls drives. Positions are CSS px in the canvas. */
export interface ControlsHost {
    /** The camera, or null before the viewer is set up. */
    camera(): Camera2 | null;
    /** The camera moved. */
    changed(): void;
    /** A press and release without a drag. */
    click(p: Vec2, e: PointerEvent): void;
    /** The pointer moved over the canvas (or the view moved under it). */
    hover(p: Vec2): void;
}

// A left press that moves further than this is a pan, not a click.
const CLICK_SLOP_PX = 4;
// Wheel zoom per pixel of wheel delta; a mouse notch is ~100 px in Chrome.
const WHEEL_ZOOM = 0.002;
// Trackpad pinches arrive as ctrl+wheel with small deltas.
const PINCH_ZOOM = 0.01;
const MAX_WHEEL_DELTA = 300;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1000;

/**
 * KiCad-like pointer input: the wheel zooms about the cursor (shift+wheel
 * pans sideways), any button drags to pan (left only after a few px, so a
 * left click stays a click), two fingers pinch and pan.
 */
export class PointerControls implements IDisposable {
    #disposables = new Disposables();
    #pointers = new Map<number, Vec2>();
    #drag: { id: number; start: Vec2; button: number; moved: boolean } | null =
        null;
    #pinch: { dist: number; mid: Vec2 } | null = null;

    constructor(
        readonly canvas: HTMLCanvasElement,
        readonly host: ControlsHost,
    ) {
        const on = <K extends keyof GlobalEventHandlersEventMap>(
            type: K,
            fn: (e: GlobalEventHandlersEventMap[K]) => void,
            options?: AddEventListenerOptions,
        ) => this.#disposables.add(listen(canvas, type, fn, options));

        on("wheel", (e) => this.#wheel(e), { passive: false });
        on("pointerdown", (e) => this.#down(e));
        on("pointermove", (e) => this.#move(e));
        on("pointerup", (e) => this.#up(e, true));
        on("pointercancel", (e) => this.#up(e, false));
        on("contextmenu", (e) => e.preventDefault());
    }

    dispose() {
        this.#disposables.dispose();
    }

    #pos(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
    }

    /** Scale the zoom by `factor`, keeping the world point under `p` fixed. */
    #zoom_about(camera: Camera2, p: Vec2, factor: number) {
        const before = camera.screen_to_world(p);
        camera.zoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, camera.zoom * factor),
        );
        const after = camera.screen_to_world(p);
        camera.center.set(camera.center.add(before.sub(after)));
    }

    /** Move the view so the world point under `from` ends up under `to`. */
    #pan(camera: Camera2, from: Vec2, to: Vec2) {
        const delta = camera
            .screen_to_world(from)
            .sub(camera.screen_to_world(to));
        camera.center.set(camera.center.add(delta));
    }

    #wheel(e: WheelEvent) {
        const camera = this.host.camera();
        if (!camera) {
            return;
        }
        e.preventDefault();

        const scale =
            e.deltaMode == WheelEvent.DOM_DELTA_LINE
                ? 33
                : e.deltaMode == WheelEvent.DOM_DELTA_PAGE
                  ? 800
                  : 1;
        const clamp = (d: number) =>
            Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, d * scale));
        const p = this.#pos(e);

        if (e.shiftKey) {
            const d = clamp(e.deltaY || e.deltaX);
            this.#pan(camera, p, p.add(new Vec2(-d, 0)));
        } else {
            const rate = e.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM;
            this.#zoom_about(camera, p, Math.exp(-clamp(e.deltaY) * rate));
        }
        this.host.changed();
        this.host.hover(p);
    }

    #down(e: PointerEvent) {
        const p = this.#pos(e);
        this.#pointers.set(e.pointerId, p);
        this.canvas.setPointerCapture(e.pointerId);

        if (this.#pointers.size == 1) {
            this.#drag = {
                id: e.pointerId,
                start: p,
                button: e.button,
                // Middle and right buttons only ever pan.
                moved: e.button != 0,
            };
            if (this.#drag.moved) {
                this.canvas.dataset["panning"] = "";
            }
        } else if (this.#pointers.size == 2) {
            // A second finger turns the gesture into a pinch; no click.
            this.#drag = null;
            this.#pinch = this.#pinch_state();
            this.canvas.dataset["panning"] = "";
        }
    }

    #pinch_state() {
        const [a, b] = [...this.#pointers.values()];
        return {
            dist: a!.sub(b!).magnitude,
            mid: a!.add(b!).multiply(0.5),
        };
    }

    #move(e: PointerEvent) {
        const p = this.#pos(e);
        const prev = this.#pointers.get(e.pointerId);
        const camera = this.host.camera();

        if (prev && camera) {
            this.#pointers.set(e.pointerId, p);

            if (this.#pinch && this.#pointers.size == 2) {
                const next = this.#pinch_state();
                if (this.#pinch.dist > 0) {
                    this.#zoom_about(
                        camera,
                        this.#pinch.mid,
                        next.dist / this.#pinch.dist,
                    );
                }
                this.#pan(camera, this.#pinch.mid, next.mid);
                this.#pinch = next;
                this.host.changed();
            } else if (this.#drag?.id == e.pointerId) {
                if (
                    !this.#drag.moved &&
                    p.sub(this.#drag.start).magnitude > CLICK_SLOP_PX
                ) {
                    this.#drag.moved = true;
                    this.canvas.dataset["panning"] = "";
                }
                if (this.#drag.moved) {
                    this.#pan(camera, prev, p);
                    this.host.changed();
                }
            }
        }

        this.host.hover(p);
    }

    #up(e: PointerEvent, released: boolean) {
        const drag = this.#drag;
        this.#pointers.delete(e.pointerId);
        if (this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }

        if (drag?.id == e.pointerId) {
            this.#drag = null;
            if (released && !drag.moved) {
                this.host.click(this.#pos(e), e);
            }
        }
        if (this.#pointers.size < 2) {
            this.#pinch = null;
        }
        if (!this.#drag && !this.#pinch) {
            delete this.canvas.dataset["panning"];
        }
    }
}
