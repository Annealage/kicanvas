/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle, Arc, Matrix3, Vec2 } from "../base/math";
import * as board_items from "../kicad/board";

/** Something under a click, front-most kinds first. */
export type PickItem =
    | { kind: "pad"; ref: string; pad: string; net: string }
    | { kind: "via"; net: string }
    | { kind: "track"; net: string; layer: string }
    | { kind: "footprint"; ref: string }
    | { kind: "zone"; net: string; layer: string };

/** What's shown, so hidden things can't be clicked. */
export interface PickVisibility {
    layer(name: string): boolean;
    pads: boolean;
    vias: boolean;
    zones: boolean;
}

function segment_distance(p: Vec2, a: Vec2, b: Vec2) {
    const ab = b.sub(a);
    const len2 = ab.x * ab.x + ab.y * ab.y;
    const t =
        len2 == 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2),
              );
    return p.sub(a.add(ab.multiply(t))).magnitude;
}

function polyline_distance(p: Vec2, pts: Vec2[]) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
        best = Math.min(best, segment_distance(p, pts[i - 1]!, pts[i]!));
    }
    return best;
}

function inside_polygon(p: Vec2, pts: Vec2[]) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i]!;
        const b = pts[j]!;
        if (
            a.y > p.y != b.y > p.y &&
            p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
}

function pad_layers_visible(pad: board_items.Pad, vis: PickVisibility) {
    return pad.layers.some((l) =>
        l == "*.Cu" ? vis.layer("F.Cu") || vis.layer("B.Cu") : vis.layer(l),
    );
}

function pad_hit(
    fp: board_items.Footprint,
    pad: board_items.Pad,
    p: Vec2,
    tol: number,
) {
    // The same transform chain PadPainter draws the pad with.
    const matrix = Matrix3.translation(fp.at.position.x, fp.at.position.y)
        .rotate_self(Angle.deg_to_rad(fp.at.rotation))
        .multiply(
            Matrix3.translation(pad.at.position.x, pad.at.position.y)
                .rotate_self(-Angle.deg_to_rad(fp.at.rotation))
                .rotate_self(Angle.deg_to_rad(pad.at.rotation)),
        );
    const local = matrix.inverse().transform(p);
    if (pad.shape == "circle") {
        return local.magnitude <= pad.size.x / 2 + tol;
    }
    return (
        Math.abs(local.x) <= pad.size.x / 2 + tol &&
        Math.abs(local.y) <= pad.size.y / 2 + tol
    );
}

/**
 * Everything visible under board point `p` (mm), within `tol` mm for thin
 * things. Order: pads, vias, tracks, footprints (smallest first), zones.
 */
export function pick(
    board: board_items.KicadPCB,
    p: Vec2,
    tol: number,
    vis: PickVisibility,
): PickItem[] {
    const items: PickItem[] = [];
    const any_copper = board.layers.some(
        (l) => l.canonical_name.endsWith(".Cu") && vis.layer(l.canonical_name),
    );

    if (vis.pads) {
        for (const fp of board.footprints) {
            for (const pad of fp.pads) {
                if (pad_layers_visible(pad, vis) && pad_hit(fp, pad, p, tol)) {
                    items.push({
                        kind: "pad",
                        ref: fp.reference,
                        pad: pad.number,
                        net: pad.net?.name ?? "",
                    });
                }
            }
        }
    }

    if (vis.vias && any_copper) {
        for (const via of board.vias) {
            if (p.sub(via.at.position).magnitude <= via.size / 2 + tol) {
                items.push({ kind: "via", net: via.netname ?? "" });
            }
        }
    }

    for (const seg of board.segments) {
        if (!vis.layer(seg.layer)) {
            continue;
        }
        const d =
            seg instanceof board_items.ArcSegment
                ? polyline_distance(
                      p,
                      Arc.from_three_points(
                          seg.start,
                          seg.mid,
                          seg.end,
                          seg.width,
                      ).to_polyline(),
                  )
                : segment_distance(p, seg.start, seg.end);
        if (d <= seg.width / 2 + tol) {
            items.push({
                kind: "track",
                net: seg.netname ?? "",
                layer: seg.layer,
            });
        }
    }

    const footprints = board.footprints
        .filter((fp) => {
            const side = fp.layer.startsWith("B.") ? "B." : "F.";
            return (
                board.layers.some(
                    (l) =>
                        l.canonical_name.startsWith(side) &&
                        vis.layer(l.canonical_name),
                ) && fp.bbox.contains_point(p)
            );
        })
        .sort((a, b) => a.bbox.w * a.bbox.h - b.bbox.w * b.bbox.h);
    for (const fp of footprints) {
        items.push({ kind: "footprint", ref: fp.reference });
    }

    if (vis.zones) {
        for (const zone of board.zones) {
            for (const poly of zone.filled_polygons ?? []) {
                if (
                    vis.layer(poly.layer) &&
                    poly.bbox.contains_point(p) &&
                    inside_polygon(p, poly.polyline)
                ) {
                    items.push({
                        kind: "zone",
                        net: zone.net_name ?? "",
                        layer: poly.layer,
                    });
                }
            }
        }
    }

    return items;
}
