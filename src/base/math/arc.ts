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

    static from_center_start_end(
        center: Vec2,
        start: Vec2,
        end: Vec2,
        width: number,
    ) {
        // See EDA_SHAPE::CalcArcAngles - normalizes the start and end angle so
        // that start < end and their values are between -360 and +360.
        const radius = start.sub(center).magnitude;
        const start_radial = start.sub(center);
        const end_radial = end.sub(center);
        let start_angle = start_radial.kicad_angle;
        let end_angle = end_radial.kicad_angle;

        if (end_angle.degrees == start_angle.degrees) {
            // This is a circle, not a zero-length arc.
            end_angle.degrees = start_angle.degrees + 360;
        }

        if (start_angle.degrees > end_angle.degrees) {
            if (end_angle.degrees < 0) {
                end_angle = end_angle.normalize();
            } else {
                start_angle = start_angle
                    .normalize()
                    .sub(Angle.from_degrees(-360));
            }
        }

        return new Arc(center, radius, start_angle, end_angle, width);
    }

    get start_radial() {
        return this.start_angle.rotate_point(new Vec2(this.radius, 0));
    }

    get start_point() {
        return this.center.add(this.start_radial);
    }

    get end_radial() {
        return this.end_angle.rotate_point(new Vec2(this.radius, 0));
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
        return this.mid_angle.rotate_point(new Vec2(this.radius, 0));
    }

    get mid_point() {
        return this.center.add(this.mid_radial);
    }

    get arc_angle(): Angle {
        return this.end_angle.sub(this.start_angle);
    }

    /**
     * Approximate the Arc using a polyline
     */
    to_polyline(): Vec2[] {
        const points: Vec2[] = [];
        let start = this.start_angle.radians;
        let end = this.end_angle.radians;

        if (start > end) {
            [end, start] = [start, end];
        }

        // TODO: Pull KiCad's logic for this, since it adds more segments the
        // larger the arc is.
        for (let theta = start; theta < end; theta += Math.PI / 32) {
            points.push(
                new Vec2(
                    this.center.x + Math.cos(theta) * this.radius,
                    this.center.y + Math.sin(theta) * this.radius,
                ),
            );
        }

        let last_angle;
        if (this.direction === "counter-clockwise") {
            // for a counter-clockwise arc, it was drawn from the endpoint to the start
            // so we need reverse the points
            points.reverse();
            last_angle = start;
        } else {
            last_angle = end;
        }

        // Add the last point if needed.
        const last_point = new Vec2(
            this.center.x + Math.cos(last_angle) * this.radius,
            this.center.y + Math.sin(last_angle) * this.radius,
        );

        if (!last_point.equals(points[points.length - 1])) {
            points.push(last_point);
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
     * Get a bounding box that encloses the entire arc.
     */
    get bbox(): BBox {
        // An arc's bbox contains at least three points: the radial for the
        // start angle, the radial for the end angle, and the radial inbetween.
        // However, that doesn't cover all cases. Whenever the arc crosses an
        // axis, the radial at that axis must also be included.
        const points = [this.start_point, this.mid_point, this.end_point];

        if (this.start_angle.degrees < 0 && this.end_angle.degrees >= 0) {
            points.push(this.center.add(new Vec2(this.radius, 0)));
        }

        if (this.start_angle.degrees < 90 && this.end_angle.degrees >= 90) {
            points.push(this.center.add(new Vec2(0, this.radius)));
        }

        if (this.start_angle.degrees < 180 && this.end_angle.degrees >= 180) {
            points.push(this.center.add(new Vec2(-this.radius, 0)));
        }

        if (this.start_angle.degrees < 270 && this.end_angle.degrees >= 270) {
            points.push(this.center.add(new Vec2(0, this.radius)));
        }

        if (this.start_angle.degrees < 360 && this.end_angle.degrees >= 360) {
            points.push(this.center.add(new Vec2(0, this.radius)));
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
