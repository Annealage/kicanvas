/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Color } from "../../base/color";
import type { Theme } from "../../kicad/theme";

/**
 * Annealage: a dark theme matching Loom's page (near-black steel background,
 * steel grey chrome). KiCad's layer semantics are kept: front copper is warm
 * (ember copper), back copper cool (quench blue), inner copper muted so the
 * outer layers read first, silkscreen near-white, zones slightly translucent
 * so tracks and the layers beneath show through, vias light steel so they
 * stand out against pours.
 */

// Muted inner copper colours, cycled for boards with many inner layers.
const inner = [
    "rgb(118, 158, 108)", // sage
    "rgb(150, 122, 172)", // mauve
    "rgb(92, 150, 150)", // teal
    "rgb(176, 156, 98)", // straw
    "rgb(170, 110, 120)", // rose
    "rgb(110, 126, 170)", // slate blue
].map((c) => Color.from_css(c));

function inner_copper(n: number) {
    return inner[(n - 1) % inner.length]!;
}

const theme: Theme = {
    name: "annealage",
    friendly_name: "Annealage",
    board: {
        anchor: Color.from_css("rgb(230, 195, 106)"),
        aux_items: Color.from_css("rgb(220, 220, 220)"),
        b_adhes: Color.from_css("rgb(70, 70, 150)"),
        b_crtyd: Color.from_css("rgb(90, 200, 214)"),
        b_fab: Color.from_css("rgb(120, 136, 160)"),
        b_mask: Color.from_css("rgba(80, 140, 190, 0.35)"),
        b_paste: Color.from_css("rgba(150, 175, 200, 0.55)"),
        b_silks: Color.from_css("rgb(190, 200, 214)"),
        background: Color.from_css("rgb(20, 23, 26)"),
        cmts_user: Color.from_css("rgb(110, 150, 220)"),
        copper: {
            f: Color.from_css("rgb(226, 120, 58)"),
            b: Color.from_css("rgb(72, 146, 212)"),
            in1: inner_copper(1),
            in2: inner_copper(2),
            in3: inner_copper(3),
            in4: inner_copper(4),
            in5: inner_copper(5),
            in6: inner_copper(6),
            in7: inner_copper(7),
            in8: inner_copper(8),
            in9: inner_copper(9),
            in10: inner_copper(10),
            in11: inner_copper(11),
            in12: inner_copper(12),
            in13: inner_copper(13),
            in14: inner_copper(14),
            in15: inner_copper(15),
            in16: inner_copper(16),
            in17: inner_copper(17),
            in18: inner_copper(18),
            in19: inner_copper(19),
            in20: inner_copper(20),
            in21: inner_copper(21),
            in22: inner_copper(22),
            in23: inner_copper(23),
            in24: inner_copper(24),
            in25: inner_copper(25),
            in26: inner_copper(26),
            in27: inner_copper(27),
            in28: inner_copper(28),
            in29: inner_copper(29),
            in30: inner_copper(30),
        },
        cursor: Color.from_css("rgb(230, 232, 236)"),
        drc_error: Color.from_css("rgba(240, 96, 90, 0.8)"),
        drc_exclusion: Color.from_css("rgba(220, 220, 220, 0.8)"),
        drc_warning: Color.from_css("rgba(217, 184, 74, 0.8)"),
        dwgs_user: Color.from_css("rgb(200, 204, 210)"),
        eco1_user: Color.from_css("rgb(120, 190, 140)"),
        eco2_user: Color.from_css("rgb(214, 180, 110)"),
        edge_cuts: Color.from_css("rgb(230, 195, 106)"),
        f_adhes: Color.from_css("rgb(150, 80, 150)"),
        f_crtyd: Color.from_css("rgb(214, 110, 184)"),
        f_fab: Color.from_css("rgb(170, 160, 140)"),
        f_mask: Color.from_css("rgba(214, 120, 90, 0.35)"),
        f_paste: Color.from_css("rgba(200, 200, 210, 0.55)"),
        f_silks: Color.from_css("rgb(236, 234, 226)"),
        footprint_text_invisible: Color.from_css("rgb(90, 96, 104)"),
        grid: Color.from_css("rgb(58, 63, 69)"),
        grid_axes: Color.from_css("rgb(107, 114, 128)"),
        margin: Color.from_css("rgb(190, 120, 170)"),
        no_connect: Color.from_css("rgb(90, 150, 230)"),
        pad_plated_hole: Color.from_css("rgb(200, 170, 90)"),
        pad_through_hole: Color.from_css("rgb(214, 180, 96)"),
        non_plated_hole: Color.from_css("rgb(120, 190, 205)"),
        ratsnest: Color.from_css("rgb(160, 170, 190)"),
        user_1: Color.from_css("rgb(200, 150, 100)"),
        user_2: Color.from_css("rgb(110, 150, 210)"),
        user_3: Color.from_css("rgb(150, 200, 180)"),
        user_4: Color.from_css("rgb(210, 190, 110)"),
        user_5: Color.from_css("rgb(180, 180, 180)"),
        user_6: Color.from_css("rgb(160, 130, 200)"),
        user_7: Color.from_css("rgb(120, 190, 200)"),
        user_8: Color.from_css("rgb(200, 140, 150)"),
        user_9: Color.from_css("rgb(170, 190, 120)"),
        via_blind_buried: Color.from_css("rgb(190, 160, 90)"),
        via_hole: Color.from_css("rgb(28, 31, 35)"),
        via_micro: Color.from_css("rgb(90, 170, 180)"),
        via_through: Color.from_css("rgb(214, 218, 224)"),
        worksheet: Color.from_css("rgb(107, 114, 128)"),
        zone_opacity: 0.45,
    },
    schematic: {
        anchor: Color.from_css("rgb(230, 195, 106)"),
        aux_items: Color.from_css("rgb(220, 220, 220)"),
        background: Color.from_css("rgb(20, 23, 26)"),
        brightened: Color.from_css("rgb(255, 180, 120)"),
        bus: Color.from_css("rgb(80, 130, 210)"),
        bus_junction: Color.from_css("rgb(80, 130, 210)"),
        component_body: Color.from_css("rgb(34, 38, 44)"),
        component_outline: Color.from_css("rgb(226, 120, 58)"),
        cursor: Color.from_css("rgb(230, 232, 236)"),
        erc_error: Color.from_css("rgba(240, 96, 90, 0.8)"),
        erc_warning: Color.from_css("rgba(217, 184, 74, 0.8)"),
        fields: Color.from_css("rgb(170, 160, 200)"),
        grid: Color.from_css("rgb(58, 63, 69)"),
        grid_axes: Color.from_css("rgb(107, 114, 128)"),
        hidden: Color.from_css("rgb(90, 96, 104)"),
        junction: Color.from_css("rgb(110, 170, 220)"),
        label_global: Color.from_css("rgb(230, 195, 106)"),
        label_hier: Color.from_css("rgb(200, 150, 100)"),
        label_local: Color.from_css("rgb(230, 232, 236)"),
        netclass_flag: Color.from_css("rgb(170, 170, 180)"),
        no_connect: Color.from_css("rgb(90, 150, 230)"),
        note: Color.from_css("rgb(200, 204, 210)"),
        pin: Color.from_css("rgb(226, 120, 58)"),
        pin_name: Color.from_css("rgb(150, 200, 190)"),
        pin_number: Color.from_css("rgb(200, 160, 110)"),
        reference: Color.from_css("rgb(150, 200, 190)"),
        rule_area: Color.from_css("rgb(200, 110, 160)"),
        shadow: Color.from_css("rgba(110, 170, 220, 0.6)"),
        sheet: Color.from_css("rgb(150, 122, 172)"),
        sheet_background: Color.from_css("rgb(26, 30, 34)"),
        sheet_fields: Color.from_css("rgb(170, 160, 200)"),
        sheet_filename: Color.from_css("rgb(150, 160, 175)"),
        sheet_label: Color.from_css("rgb(200, 150, 100)"),
        sheet_name: Color.from_css("rgb(150, 200, 190)"),
        value: Color.from_css("rgb(150, 200, 190)"),
        wire: Color.from_css("rgb(110, 170, 220)"),
        worksheet: Color.from_css("rgb(107, 114, 128)"),
    },
};

export default theme;
