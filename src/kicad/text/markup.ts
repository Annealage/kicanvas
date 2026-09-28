/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * KiCad's text markup: ^{superscript}, _{subscript} and ~{overbar}, which
 * nest.
 *
 * What counts as markup, as kicad-cli 9 draws it:
 *
 * - An opener only takes effect if a closing brace matches it. Braces pair up
 *   like brackets, literal ones included: in "~{a{b}c}" the overbar covers
 *   "a{b}c". An unmatched opener, like an unmatched "}", is drawn as-is, and
 *   markup inside it still applies ("~{a^{b}" is "~{a" then a superscript b).
 * - "~" is only markup before "{": "~~{a}" is a tilde then an overlined a.
 * - Empty markup ("x_{}y", "~{}") draws nothing, not even an overbar.
 */
export class Markup {
    root: MarkupNode;

    constructor(public text: string) {
        this.root = new MarkupNode();
        this.root.is_root = true;
        this.root.children = parse(text, closing_braces(text), 0, text.length);
    }
}

/**
 * A node is either a run of plain text (`text`, no children) or a markup
 * group whose flags apply to its `children`.
 */
export class MarkupNode {
    is_root = false;
    subscript = false;
    superscript = false;
    overbar = false;
    text = "";
    children: MarkupNode[] = [];
}

const openers = {
    "^": "superscript",
    _: "subscript",
    "~": "overbar",
} as const;

/** Maps the index of each "{" to the index of the "}" that closes it. */
function closing_braces(text: string) {
    const closes = new Map<number, number>();
    const open: number[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] == "{") {
            open.push(i);
        } else if (text[i] == "}" && open.length) {
            closes.set(open.pop()!, i);
        }
    }
    return closes;
}

function parse(
    text: string,
    closes: Map<number, number>,
    start: number,
    end: number,
): MarkupNode[] {
    const nodes: MarkupNode[] = [];
    let run = "";

    const end_run = () => {
        if (run) {
            const node = new MarkupNode();
            node.text = run;
            nodes.push(node);
            run = "";
        }
    };

    let i = start;
    while (i < end) {
        const c = text[i]!;
        const close = closes.get(i + 1);
        if (c in openers && text[i + 1] == "{" && close !== undefined) {
            end_run();
            const node = new MarkupNode();
            node[openers[c as keyof typeof openers]] = true;
            node.children = parse(text, closes, i + 2, close);
            nodes.push(node);
            i = close + 1;
        } else {
            run += c;
            i++;
        }
    }

    end_run();
    return nodes;
}
