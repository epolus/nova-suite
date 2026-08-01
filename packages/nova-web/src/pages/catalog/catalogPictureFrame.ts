/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Visual frame for catalog pictures so transparent PNG/SVG assets read clearly
 * in both light and dark themes (subtle checker + inset ring).
 */
export const catalogPictureFrameBaseClass =
  'overflow-hidden flex items-center justify-center ' +
  '[background-image:repeating-conic-gradient(from_90deg,#e5e7eb_0%_25%,#f3f4f6_0%_50%)] ' +
  'dark:[background-image:repeating-conic-gradient(from_90deg,#3f3f46_0%_25%,#27272a_0%_50%)] ' +
  '[background-size:10px_10px] ' +
  'ring-1 ring-inset ring-gray-200/80 dark:ring-zinc-600/50';
