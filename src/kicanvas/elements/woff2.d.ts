/*
    Copyright (c) 2026 Annealage.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * Esbuild bundles woff2 files using the "binary" content type.
 * This tells typescript about it.
 */

declare module "*.woff2" {
    const value: Uint8Array<ArrayBuffer>;
    export default value;
}
