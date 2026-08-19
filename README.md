# Title Word Count

Adds a live word/character count to the post title in the block editor. No build step — plain JS with `wp.element.createElement`.

## Two different "post titles"

The editor has two unrelated things that both render as `.wp-block-post-title`, and they need separate integrations:

| | What it is | How the plugin hooks in |
| --- | --- | --- |
| **`core/post-title` block** | A real registered block. Only exists in the site editor, the template editor, and inside a Query Loop. | `editor.BlockEdit` block filter. |
| **Post editor title field** | *Not a block.* It is the `PostTitle` component from `@wordpress/editor` — a bare `<h1 contenteditable>` rendered above the block list that merely borrows the `wp-block-post-title` class name for styling. | `registerPlugin()` + `PluginDocumentSettingPanel`. |

Block filters never run for the second one, so anything built purely on `editor.BlockEdit` / `editor.BlockListBlock` has no effect in the post editor.

## Install

Drop the `title-word-count` folder into `wp-content/plugins/` and activate.

## How it works

**Counting** — [`@wordpress/wordcount`](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-wordcount/), available in the editor as `wp.wordcount.count( text, type, userSettings )` via the `wp-wordcount` script dependency. All three strategies are used: `words`, `characters_including_spaces`, `characters_excluding_spaces`. The locale's counting type (`wp_get_word_count_type()`) decides which figure the badge shows, so CJK locales get characters rather than words.

**The panel** — an inspector-sidebar panel via `editor.BlockEdit` for the block, and a document-settings panel via `PluginDocumentSettingPanel` for the post editor. Both list words / characters / characters without spaces.

**The badge** — the script writes `data-title-word-count` + a `has-title-word-count` class onto the title node, and CSS renders it as a pseudo-element badge above the title on hover/selection. The block case is located by its `data-block="<clientId>"` attribute; the post editor case by `.editor-post-title__input`.

`editor.BlockListBlock` is deliberately *not* used: it does not receive `props.context`, so it cannot tell which entity a Post Title block is bound to inside a Query Loop. `editor.BlockEdit` does, so the badge is written from there.

**Two enqueue hooks** — since WordPress 6.3 the editor canvas is an iframe:

| Hook | Loads into | Carries |
| --- | --- | --- |
| `enqueue_block_editor_assets` | the outer admin document | the script, and the sidebar panel styles |
| `enqueue_block_assets` (guarded with `is_admin()`) | the iframed canvas, replayed by `_wp_get_iframed_editor_assets()` | the badge styles |

Styles enqueued only on `enqueue_block_editor_assets` never reach the canvas, so the badge would be invisible even where the class was applied.

**Where the title text comes from** — `core/post-title` doesn't keep the title in block attributes. The plugin reads it from the store so the count updates as you type:

- Post editor: `core/editor` → `getEditedPostAttribute( 'title' )`
- Site editor / query loop: block context (`postId`, `postType`) → `core` → `getEditedEntityRecord()`

## New post vs. existing post

Exposed on `window.titleWordCount` (no UI change — call it where you need it):

```js
titleWordCount.isNewPost();       // true = never saved, false = saved, null = unknown
titleWordCount.useIsNewPost();    // same, as a hook — re-renders when it flips
```

Both accept an optional block context (`{ postId, postType }`) for the site editor / Query Loop case, where the bound entity's status is the authoritative answer.

The post-editor answer comes from Gutenberg's own selector:

```js
wp.data.select( 'core/editor' ).isEditedPostNew();
```

which is a `status === 'auto-draft'` check. Two gotchas that follow from that:

- **Don't use `getCurrentPostId()` for this.** WordPress creates an auto-draft row — with a real post ID — as soon as `post-new.php` loads, so a brand new post already has an ID.
- The flag flips to `false` on a real save; autosaves alone don't flip it.

Related selector: `isCleanNewPost()` is stricter — new *and* with no unsaved edits, i.e. a post the user hasn't typed into yet.

## Performance notes

`editor.BlockEdit` runs for *every* block, which the handbook flags as a selection-performance risk. Mitigations:

- The HOC bails out with `props.name !== 'core/post-title'` **before** any hook is mounted; the `useSelect` subscription lives in a separate child component so it only ever mounts for the title block.
- The inspector panel renders only when `props.isSelected`.
- The badge is a CSS pseudo-element driven by a `data-` attribute, so nothing is injected into the editable DOM and the label can never be saved into the title.
- The post-editor node lookup retries at most 25 times at 200 ms while the canvas iframe mounts, then gives up — so it costs nothing in the site editor, where that node never appears.

## Customising

- Change `TARGET_BLOCK` in `js/title-word-count.js` to target a different block (e.g. `core/heading` — note that block keeps its text in `attributes.content`, so `useTitleText` would need to read from attributes instead). That only affects the block path; the post editor field is separate.
- Badge position, colour, and visibility rules live in `css/title-word-count.css`. Delete the `:hover` / `.is-selected` rules to show it always.
