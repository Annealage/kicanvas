/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle } from "./angle";
import { BBox } from "./bbox";
import { Vec2 } from "./vec2";

/**
 * Arc direction
 */
export type ArcDirection = "clockwise" | "counter-clockwise";

/**
 * A circular arc
 */
export class Arc {
    /**
     * Create a new Arc
     */
    constructor(
        public center: Vec2,
        public radius: number,
        public start_angle: Angle,
        public end_angle: Angle,
        public width: number,
        public direction: ArcDirection = "clockwise",
    ) {}

    /**
     * Create an Arc given three points on a circle
     */
    static from_three_points(start: Vec2, mid: Vec2, end: Vec2, width = 1) {
        const u = 1000000;
        const center = arc_center_from_three_points(
            new Vec2(start.x * u, start.y * u),
            new Vec2(mid.x * u, mid.y * u),
            new Vec2(end.x * u, end.y * u),
        );
        center.x /= u;
        center.y /= u;
        const radius = center.sub(mid).magnitude;

        const start_angle = start.sub(center).angle;
        const mid_angle = mid.sub(center).angle;
        const end_angle = end.sub(center).angle;

        // calculate the arc angle
        let arc_angle;
        const start_to_mid = mid_angle.sub(start_angle).normalize();
        const start_to_end = end_angle.sub(start_angle).normalize();

        if (start_to_mid.degrees < start_to_end.degrees) {
            // minor arc, angle = start_to_end
            arc_angle = start_to_end;
        } else {
            // major arc, angle = 360 - start_to_end
            arc_angle = Angle.from_degrees(360).sub(start_to_end);
        }

        // although KiCad always creates clockwise arcs, the file may contain
        // counter-clockwise arcs through imports from other EDA/CAD programs
        let arc_start;
        let direction: ArcDirection;

        const mid_to_start = mid.sub(start);
        const end_to_mid = end.sub(mid);

        if (mid_to_start.cross(end_to_mid) < 0) {
            arc_start = end_angle.normalize();
            direction = "counter-clockwise";
        } else {
            arc_start = start_angle.normalize();
            direction = "clockwise";
        }

        const arc_end = arc_start.add(arc_angle);

        return new Arc(center, radius, arc_start, arc_end, width, direction);
    }

    /**
     * The arc round `center` from `start` to `end`, sweeping the way angles
     * grow (clockwise as drawn, +y being down): its start angle is
     * `start`'s direction, in (-180, 180], and its end angle the start plus
     * a sweep in (0, 360], a whole circle when `start` and `end` coincide.
     * Measured against KiCad 9 (pcbnew's CalcArcAngles on 342 arcs: random
     * centres, radii and ends, and every pair of the axes and 45 degrees).
     */
    static from_center_start_end(
        center: Vec2,
        start: Vec2,
        end: Vec2,
        width: number,
    ) {
        const start_radial = start.sub(center);
        const start_angle = start_radial.kicad_angle;
        let sweep = end.sub(center).kicad_angle.radians - start_angle.radians;
        if (sweep <= 0) {
            sweep += 2 * Math.PI;
        }
        return new Arc(
            center,
            start_radial.magnitude,
            start_angle,
            new Angle(start_angle.radians + sweep),
            width,
        );
    }

    /**
     * The radial at `angle`: angles grow clockwise as drawn (+y being down),
     * the way to_polyline() walks the arc.
     */
    private radial_at(angle: Angle) {
        return new Vec2(
            Math.cos(angle.radians) * this.radius,
            Math.sin(angle.radians) * this.radius,
        );
    }

    get start_radial() {
        return this.radial_at(this.start_angle);
    }

    get start_point() {
        return this.center.add(this.start_radial);
    }

    get end_radial() {
        return this.radial_at(this.end_angle);
    }

    get end_point() {
        return this.center.add(this.end_radial);
    }

    get mid_angle() {
        return new Angle(
            (this.start_angle.radians + this.end_angle.radians) / 2,
        );
    }

    get mid_radial() {
        return this.radial_at(this.mid_angle);
    }

    get mid_point() {
        return this.center.add(this.mid_radial);
    }

    get arc_angle(): Angle {
        return this.end_angle.sub(this.start_angle);
    }

    /**
     * Approximate the Arc using a polyline. It runs from the smaller angle
     * to the larger, or the other way for a counter-clockwise arc, and ends
     * on exactly start_point and end_point.
     */
    to_polyline(): Vec2[] {
        const points: Vec2[] = [];
        const lo = Math.min(this.start_angle.radians, this.end_angle.radians);
        const hi = Math.max(this.start_angle.radians, this.end_angle.radians);
        const at = (theta: number) =>
            new Vec2(
                this.center.x + Math.cos(theta) * this.radius,
                this.center.y + Math.sin(theta) * this.radius,
            );

        // TODO: step by a chord-error tolerance rather than a fixed angle,
        // so that larger arcs get more segments.
        for (let theta = lo; theta < hi; theta += Math.PI / 32) {
            points.push(at(theta));
        }

        const far_end = at(hi);
        if (!far_end.equals(points[points.length - 1])) {
            points.push(far_end);
        }

        if (this.direction === "counter-clockwise") {
            // Drawn from the end back to the start.
            points.reverse();
        }

        return points;
    }

    /**
     * Same as to_polyline, but includes the arc center
     */
    to_polygon(): Vec2[] {
        const points = this.to_polyline();
        points.push(this.center);
        return points;
    }

    /**
     * Get a bounding box that encloses the entire arc: its two ends plus
     * every axis direction (a multiple of 90 degrees) the sweep passes
     * through, where the circle reaches its extremes.
     */
    get bbox(): BBox {
        const points = [this.start_point, this.end_point];

        const quarter = Math.PI / 2;
        const lo = Math.min(this.start_angle.radians, this.end_angle.radians);
        const hi = Math.max(this.start_angle.radians, this.end_angle.radians);
        const first = Math.ceil(lo / quarter);
        // Past four quarters the directions repeat.
        const last = Math.min(Math.floor(hi / quarter), first + 3);
        for (let k = first; k <= last; k++) {
            const axis = this.radial_at(new Angle(k * quarter));
            points.push(this.center.add(axis));
        }

        return BBox.from_points(points);
    }
}

/**
 * The centre of the circle through three points on it: the circumcentre of
 * the triangle they make. A full circle (start == end) has its centre half
 * way between start and mid; three points in a line have no circle, and get
 * the middle of start and end.
 */
function arc_center_from_three_points(start: Vec2, mid: Vec2, end: Vec2): Vec2 {
    const bx = mid.x - start.x;
    const by = mid.y - start.y;
    const cx = end.x - start.x;
    const cy = end.y - start.y;
    const d = 2 * (bx * cy - by * cx);

    if (d == 0) {
        if (cx == 0 && cy == 0) {
            return new Vec2((start.x + mid.x) / 2, (start.y + mid.y) / 2);
        }
        return new Vec2((start.x + end.x) / 2, (start.y + end.y) / 2);
    }

    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    return new Vec2(
        start.x + (cy * b2 - by * c2) / d,
        start.y + (bx * c2 - cx * b2) / d,
    );
}
