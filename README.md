# Title Word Count

Adds a live word/character count to the core Post Title block (`core/post-title`) in the block editor. No build step — plain JS with `wp.element.createElement`.

## Install

Drop the `title-word-count` folder into `wp-content/plugins/` and activate.

## How it works

**Counting** — [`@wordpress/wordcount`](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-wordcount/), available in the editor as `wp.wordcount.count( text, type, userSettings )` via the `wp-wordcount` script dependency. All three strategies are used: `words`, `characters_including_spaces`, `characters_excluding_spaces`. The locale's counting type (`wp_get_word_count_type()`) decides which figure the badge shows, so CJK locales get characters rather than words.

**Two [block filters](https://developer.wordpress.org/block-editor/reference-guides/filters/block-filters/):**

| Filter | Purpose |
| --- | --- |
| `editor.BlockEdit` | Wraps the Post Title `edit` component to add a **Title word count** panel in the inspector sidebar (words / characters / characters without spaces). |
| `editor.BlockListBlock` | Wraps the block's list wrapper to add `data-title-word-count` + a `has-title-word-count` class; CSS renders it as a badge above the title on hover/selection. |

**Where the title text comes from** — `core/post-title` doesn't keep the title in block attributes. The plugin reads it from the store so the count updates as you type:

- Post editor: `core/editor` → `getEditedPostAttribute( 'title' )`
- Site editor / query loop: block context (`postId`, `postType`) → `core` → `getEditedEntityRecord()`

## Performance notes

Both filters run for *every* block, which the handbook flags as a selection-performance risk. Mitigations:

- The HOCs bail out with `props.name !== 'core/post-title'` **before** any hook is mounted; the `useSelect` subscription lives in a separate child component so it only ever mounts for the title block.
- The inspector panel renders only when `props.isSelected`.
- The badge is a CSS pseudo-element on the wrapper, so nothing is injected into the block's editable DOM and the label can never be saved into the title.

## Customising

- Change `TARGET_BLOCK` in `js/title-word-count.js` to target a different block (e.g. `core/heading` — note that block keeps its text in `attributes.content`, so `useTitleText` would need to read from attributes instead).
- Badge position, colour, and visibility rules live in `css/title-word-count.css`. Delete the `:hover` / `.is-selected` rules to show it always.
