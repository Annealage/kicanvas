/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Color } from "../../base/color";
import type { Theme } from "../../kicad/theme";
import kicad_default from "./kicad-default";

/**
 * Annealage light: the board on the Workbench light scheme's view colour
 * (#FBFBFB). The same layer semantics as `annealage` (front copper warm, back
 * copper cool, inner copper in distinct hues, faint zones) with every colour
 * deepened to hold at least 3:1 contrast against the light background, and
 * silkscreen, fab and courtyard drawn dark, since white silk vanishes on a
 * light view. Pad labels stay white over the saturated pads. The schematic
 * half is KiCad's own light palette.
 */

// Inner copper colours, cycled for boards with many inner layers.
const inner = [
    "rgb(34, 139, 58)", // green
    "rgb(134, 64, 196)", // violet
    "rgb(0, 133, 138)", // teal
    "rgb(160, 118, 0)", // straw
    "rgb(200, 40, 86)", // rose
    "rgb(70, 86, 214)", // periwinkle
].map((c) => Color.from_css(c));

function inner_copper(n: number) {
    return inner[(n - 1) % inner.length]!;
}

const copper: Theme["board"]["copper"] = {
    f: Color.from_css("rgb(210, 84, 14)"),
    b: Color.from_css("rgb(24, 104, 214)"),
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
};

const theme: Theme = {
    name: "annealage-light",
    friendly_name: "Annealage light",
    board: {
        anchor: Color.from_css("rgb(150, 110, 0)"),
        aux_items: Color.from_css("rgb(60, 64, 70)"),
        b_adhes: Color.from_css("rgb(60, 60, 150)"),
        b_crtyd: Color.from_css("rgb(0, 128, 150)"),
        b_fab: Color.from_css("rgb(84, 100, 128)"),
        b_mask: Color.from_css("rgba(40, 100, 170, 0.22)"),
        b_paste: Color.from_css("rgba(90, 110, 140, 0.4)"),
        b_silks: Color.from_css("rgb(44, 70, 110)"),
        background: Color.from_css("rgb(251, 251, 251)"),
        cmts_user: Color.from_css("rgb(40, 84, 170)"),
        copper,
        cursor: Color.from_css("rgb(20, 23, 26)"),
        drc_error: Color.from_css("rgba(179, 38, 30, 0.8)"),
        drc_exclusion: Color.from_css("rgba(100, 104, 110, 0.8)"),
        drc_warning: Color.from_css("rgba(138, 90, 0, 0.8)"),
        dwgs_user: Color.from_css("rgb(70, 74, 80)"),
        eco1_user: Color.from_css("rgb(30, 120, 60)"),
        eco2_user: Color.from_css("rgb(140, 100, 20)"),
        edge_cuts: Color.from_css("rgb(150, 110, 0)"),
        f_adhes: Color.from_css("rgb(130, 50, 130)"),
        f_crtyd: Color.from_css("rgb(176, 40, 140)"),
        f_fab: Color.from_css("rgb(110, 98, 74)"),
        f_mask: Color.from_css("rgba(190, 80, 40, 0.22)"),
        f_paste: Color.from_css("rgba(110, 110, 130, 0.4)"),
        f_silks: Color.from_css("rgb(28, 31, 36)"),
        footprint_text_invisible: Color.from_css("rgb(150, 155, 162)"),
        grid: Color.from_css("rgb(222, 224, 228)"),
        grid_axes: Color.from_css("rgb(150, 155, 162)"),
        margin: Color.from_css("rgb(160, 60, 130)"),
        no_connect: Color.from_css("rgb(30, 90, 200)"),
        pad_plated_hole: Color.from_css("rgb(150, 116, 30)"),
        pad_through_hole: Color.from_css("rgb(166, 126, 24)"),
        non_plated_hole: Color.from_css("rgb(0, 120, 140)"),
        ratsnest: Color.from_css("rgb(90, 100, 120)"),
        user_1: Color.from_css("rgb(160, 100, 40)"),
        user_2: Color.from_css("rgb(50, 90, 170)"),
        user_3: Color.from_css("rgb(40, 130, 110)"),
        user_4: Color.from_css("rgb(140, 120, 20)"),
        user_5: Color.from_css("rgb(100, 100, 100)"),
        user_6: Color.from_css("rgb(110, 70, 170)"),
        user_7: Color.from_css("rgb(20, 120, 140)"),
        user_8: Color.from_css("rgb(170, 70, 90)"),
        user_9: Color.from_css("rgb(100, 120, 40)"),
        via_blind_buried: Color.from_css("rgb(150, 110, 30)"),
        via_hole: Color.from_css("rgb(244, 245, 246)"),
        via_micro: Color.from_css("rgb(20, 120, 130)"),
        via_through: Color.from_css("rgb(96, 102, 110)"),
        worksheet: Color.from_css("rgb(150, 155, 162)"),
        zone_opacity: 0.22,
    },
    schematic: kicad_default.schematic,
};

export default theme;
