/**
 * Title Word Count
 *
 * Adds a live word / character count to the post title in the editor.
 *
 * There are two entirely different things called "post title" in the editor,
 * and they need two different integrations:
 *
 *   1. The `core/post-title` BLOCK. Only exists in the site editor, the
 *      template editor and inside a Query Loop. Reached with the
 *      `editor.BlockEdit` block filter.
 *
 *   2. The post editor's title field. This is NOT a block — it is the
 *      `PostTitle` component from `@wordpress/editor`, a bare
 *      `<h1 contenteditable>` rendered above the block list that merely
 *      borrows the `wp-block-post-title` class name for styling. No block
 *      filter ever runs for it, so it is handled with a registered editor
 *      plugin instead.
 *
 * Counting is done by `@wordpress/wordcount` (exposed on `wp.wordcount`), whose
 * `count( text, type, userSettings )` signature is documented at
 * https://developer.wordpress.org/block-editor/reference-guides/packages/packages-wordcount/
 *
 * Written without JSX so it runs as-is with no build step.
 */
( function ( wp ) {
	'use strict';

	if ( ! wp || ! wp.hooks || ! wp.wordcount ) {
		return;
	}

	var addFilter = wp.hooks.addFilter;
	var createHigherOrderComponent = wp.compose.createHigherOrderComponent;
	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;
	var useSelect = wp.data.useSelect;
	var count = wp.wordcount.count;
	var __ = wp.i18n.__;
	var _n = wp.i18n._n;
	var sprintf = wp.i18n.sprintf;

	/** The block we are augmenting. */
	var TARGET_BLOCK = 'core/post-title';

	/** Marker class and data attribute the badge CSS keys off. */
	var BADGE_CLASS = 'has-title-word-count';
	var BADGE_ATTR = 'data-title-word-count';

	/**
	 * The post editor's title field. Not a block, so it can only be reached
	 * by selector.
	 */
	var POST_TITLE_SELECTOR = '.editor-post-title__input';

	/** Give up looking for the title node after this many tries (~5s). */
	var MAX_LOOKUP_ATTEMPTS = 25;
	var LOOKUP_INTERVAL_MS = 200;

	/**
	 * Locale-aware counter settings. Core localises `wordCountL10n` for the
	 * classic word counter; reusing it means CJK and other non-Latin locales
	 * count the way WordPress expects. Falls back to package defaults.
	 */
	var COUNT_SETTINGS =
		typeof window.wordCountL10n === 'object' && window.wordCountL10n !== null
			? window.wordCountL10n
			: {};

	/**
	 * The counting strategy for the current locale: some locales (e.g. ja, zh)
	 * count characters rather than words.
	 *
	 * @see https://developer.wordpress.org/reference/functions/wp_get_word_count_type/
	 */
	var COUNT_TYPE = COUNT_SETTINGS.type || 'words';

	/**
	 * Every document the editor renders into.
	 *
	 * Since WordPress 6.3 the editor canvas is an iframe, so the title — block
	 * or not — lives in `iframe[name="editor-canvas"]`'s document, not in the
	 * admin document. The inspector sidebar stays in the admin document, hence
	 * both are searched.
	 *
	 * @return {Document[]} Documents to search.
	 */
	function getEditorDocuments() {
		var docs = [ document ];
		var frames = document.querySelectorAll( 'iframe[name="editor-canvas"]' );

		Array.prototype.forEach.call( frames, function ( frame ) {
			try {
				if ( frame.contentDocument ) {
					docs.push( frame.contentDocument );
				}
			} catch ( e ) {
				// Cross-origin canvas; nothing we can do.
			}
		} );

		return docs;
	}

	/**
	 * Write the badge label onto whatever DOM node `selector` matches.
	 *
	 * The label is exposed as a `data-` attribute rendered by a CSS
	 * pseudo-element, so nothing is ever inserted into the contenteditable and
	 * the badge can never be saved into the title.
	 *
	 * @param {string} selector Selector for the title node.
	 * @param {string} label    Badge label.
	 */
	function useTitleBadge( selector, label ) {
		var nodesRef = useRef( [] );

		useEffect(
			function () {
				var timer;
				var attempts = 0;

				function apply() {
					var nodes = [];

					getEditorDocuments().forEach( function ( doc ) {
						Array.prototype.push.apply(
							nodes,
							doc.querySelectorAll( selector )
						);
					} );

					if ( ! nodes.length ) {
						// The canvas iframe may not have mounted yet.
						attempts++;

						if ( attempts < MAX_LOOKUP_ATTEMPTS ) {
							timer = setTimeout( apply, LOOKUP_INTERVAL_MS );
						}

						return;
					}

					nodesRef.current = nodes;

					nodes.forEach( function ( node ) {
						node.classList.add( BADGE_CLASS );
						node.setAttribute( BADGE_ATTR, label );
					} );
				}

				apply();

				// Only the pending lookup is cancelled here; the class stays
				// put between label changes so the badge does not flicker.
				return function () {
					clearTimeout( timer );
				};
			},
			[ selector, label ]
		);

		// Tear the badge down when the block (or the editor) goes away.
		useEffect( function () {
			return function () {
				nodesRef.current.forEach( function ( node ) {
					node.classList.remove( BADGE_CLASS );
					node.removeAttribute( BADGE_ATTR );
				} );

				nodesRef.current = [];
			};
		}, [] );
	}

	/**
	 * Read the current, unsaved post title.
	 *
	 * `core/post-title` does not store the title in block attributes — it reads
	 * it from the entity record. In the post editor the block has no context, so
	 * we fall back to the edited post. In the site editor / query loop the block
	 * receives `postId` + `postType` through block context.
	 *
	 * @param {Object} context Block context (`props.context`).
	 * @return {string} The title text, or an empty string.
	 */
	function useTitleText( context ) {
		var postId = context && context.postId;
		var postType = context && context.postType;

		return useSelect(
			function ( select ) {
				var title;

				if ( postId && postType ) {
					var record = select( 'core' ).getEditedEntityRecord(
						'postType',
						postType,
						postId
					);
					title = record && record.title;
				} else {
					var editorStore = select( 'core/editor' );
					title =
						editorStore &&
						editorStore.getEditedPostAttribute( 'title' );
				}

				if ( ! title ) {
					return '';
				}

				if ( typeof title === 'string' ) {
					return title;
				}

				// Entity titles can be `{ raw, rendered }`.
				return title.raw || title.rendered || '';
			},
			[ postId, postType ]
		);
	}

	/**
	 * Is the post being edited brand new, or an already-saved post?
	 *
	 * Gutenberg's answer lives in the `core/editor` store:
	 *
	 *   wp.data.select( 'core/editor' ).isEditedPostNew()
	 *     → true  while the post has never been saved
	 *     → false once it has been saved (draft, pending, published, …)
	 *
	 * Under the hood that is a `status === 'auto-draft'` check, which matters for
	 * two reasons:
	 *
	 *   1. Do NOT test `getCurrentPostId()` for this. WordPress creates an
	 *      auto-draft row — with a real post ID — the moment you open
	 *      post-new.php, so a brand new post already has an ID.
	 *   2. The value flips to false as soon as the post is really saved, but
	 *      autosaves alone do not flip it.
	 *
	 * Related: `isCleanNewPost()` is stricter — new *and* with no unsaved edits,
	 * i.e. a post the user has not typed into yet.
	 *
	 * In the site editor or a Query Loop the block is bound to a specific entity
	 * via context, so the entity's own status is the authoritative answer there.
	 *
	 * @param {Object} [context] Optional block context (`postId`, `postType`).
	 * @return {boolean|null} True if new, false if existing, null if unknown.
	 */
	function isNewPost( context ) {
		var postId = context && context.postId;
		var postType = context && context.postType;
		var coreStore = wp.data.select( 'core' );

		if ( postId && postType && coreStore ) {
			var record = coreStore.getEditedEntityRecord(
				'postType',
				postType,
				postId
			);

			if ( ! record ) {
				return null; // Not resolved yet.
			}

			return record.status === 'auto-draft';
		}

		var editorStore = wp.data.select( 'core/editor' );

		if ( editorStore && typeof editorStore.isEditedPostNew === 'function' ) {
			return editorStore.isEditedPostNew();
		}

		return null;
	}

	/**
	 * Reactive version of `isNewPost()` for use inside components. Re-renders
	 * when the post transitions from new to saved.
	 *
	 * @param {Object} [context] Optional block context (`postId`, `postType`).
	 * @return {boolean|null} True if new, false if existing, null if unknown.
	 */
	function useIsNewPost( context ) {
		var postId = context && context.postId;
		var postType = context && context.postType;

		return useSelect(
			function ( select ) {
				if ( postId && postType ) {
					var record = select( 'core' ).getEditedEntityRecord(
						'postType',
						postType,
						postId
					);

					return record ? record.status === 'auto-draft' : null;
				}

				var editorStore = select( 'core/editor' );

				return editorStore &&
					typeof editorStore.isEditedPostNew === 'function'
					? editorStore.isEditedPostNew()
					: null;
			},
			[ postId, postType ]
		);
	}

	/**
	 * Compute every figure we display from one title string.
	 *
	 * @param {string} text Title text.
	 * @return {Object} Counts keyed by strategy.
	 */
	function getCounts( text ) {
		return {
			words: count( text, 'words', COUNT_SETTINGS ),
			charactersExcludingSpaces: count(
				text,
				'characters_excluding_spaces',
				COUNT_SETTINGS
			),
			charactersIncludingSpaces: count(
				text,
				'characters_including_spaces',
				COUNT_SETTINGS
			),
		};
	}

	/**
	 * The short label used in the inline badge, e.g. "7 words" / "42 characters".
	 *
	 * @param {Object} counts Result of `getCounts()`.
	 * @return {string} Localised label.
	 */
	function getBadgeLabel( counts ) {
		if ( COUNT_TYPE === 'words' ) {
			return sprintf(
				/* translators: %d: number of words in the post title. */
				_n( '%d word', '%d words', counts.words, 'title-word-count' ),
				counts.words
			);
		}

		var characters =
			COUNT_TYPE === 'characters_including_spaces'
				? counts.charactersIncludingSpaces
				: counts.charactersExcludingSpaces;

		return sprintf(
			/* translators: %d: number of characters in the post title. */
			_n(
				'%d character',
				'%d characters',
				characters,
				'title-word-count'
			),
			characters
		);
	}

	/**
	 * One row of the stats list.
	 *
	 * @param {string} label Row label.
	 * @param {number} value Row value.
	 * @return {Object} Element.
	 */
	function Stat( label, value ) {
		return el(
			'div',
			{ className: 'title-word-count__stat', key: label },
			el( 'span', null, label ),
			el(
				'span',
				{ className: 'title-word-count__stat-value' },
				value.toLocaleString()
			)
		);
	}

	/**
	 * The stats list itself, shared by the block inspector panel and the post
	 * editor's document settings panel.
	 *
	 * @param {Object} props        Component props.
	 * @param {Object} props.counts Counts to render.
	 * @return {Object} Element.
	 */
	function CountStats( props ) {
		var counts = props.counts;

		return el(
			'div',
			{ className: 'title-word-count__stats' },
			Stat( __( 'Words', 'title-word-count' ), counts.words ),
			Stat(
				__( 'Characters', 'title-word-count' ),
				counts.charactersIncludingSpaces
			),
			Stat(
				__( 'Characters, no spaces', 'title-word-count' ),
				counts.charactersExcludingSpaces
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * 1. The `core/post-title` block (site editor, template editor, Query Loop)
	 * ------------------------------------------------------------------- */

	/**
	 * Renders the original edit component, the inspector panel and the badge.
	 *
	 * Kept as its own component so the hooks are only ever mounted for the
	 * target block — see the performance note on `editor.BlockEdit`.
	 *
	 * The badge is written onto the block's own wrapper, found by the
	 * `data-block` attribute `useBlockProps()` puts on every block. Doing it
	 * from `editor.BlockEdit` rather than `editor.BlockListBlock` is deliberate:
	 * only `BlockEdit` receives `props.context`, so only here do we know which
	 * entity the block is bound to inside a Query Loop.
	 *
	 * @param {Object} props Props, including the wrapped `BlockEdit`.
	 * @return {Object} Element.
	 */
	function TitleEditWithCount( props ) {
		var BlockEdit = props.BlockEdit;
		var text = useTitleText( props.context );
		var counts = getCounts( text );

		useTitleBadge(
			'[data-block="' + props.clientId + '"]',
			getBadgeLabel( counts )
		);

		return el(
			Fragment,
			null,
			el( BlockEdit, props ),
			// Only mount the panel while the block is selected, so the sidebar
			// does not churn on every unrelated selection change.
			props.isSelected
				? el(
						InspectorControls,
						null,
						el(
							PanelBody,
							{
								title: __(
									'Title word count',
									'title-word-count'
								),
								initialOpen: true,
							},
							el( CountStats, { counts: counts } )
						)
				  )
				: null
		);
	}

	/**
	 * `editor.BlockEdit` — add the inspector panel and badge to the Post Title
	 * block.
	 *
	 * @see https://developer.wordpress.org/block-editor/reference-guides/filters/block-filters/
	 */
	var withTitleWordCount = createHigherOrderComponent( function ( BlockEdit ) {
		return function ( props ) {
			if ( props.name !== TARGET_BLOCK ) {
				return el( BlockEdit, props );
			}

			return el(
				TitleEditWithCount,
				Object.assign( {}, props, { BlockEdit: BlockEdit } )
			);
		};
	}, 'withTitleWordCount' );

	addFilter(
		'editor.BlockEdit',
		'title-word-count/with-inspector-panel',
		withTitleWordCount
	);

	/* ---------------------------------------------------------------------
	 * 2. The post editor's title field (not a block)
	 * ------------------------------------------------------------------- */

	var registerPlugin = wp.plugins && wp.plugins.registerPlugin;

	// `PluginDocumentSettingPanel` moved from `@wordpress/edit-post` to
	// `@wordpress/editor` in WordPress 6.6.
	var PluginDocumentSettingPanel =
		( wp.editor && wp.editor.PluginDocumentSettingPanel ) ||
		( wp.editPost && wp.editPost.PluginDocumentSettingPanel );

	/**
	 * Badge + document settings panel for the post editor title field.
	 *
	 * `PluginDocumentSettingPanel` renders nothing outside the post editor, and
	 * the badge lookup gives up when `.editor-post-title__input` is absent, so
	 * this is inert in the site editor.
	 *
	 * @return {Object|null} Element.
	 */
	function PostTitleWordCount() {
		var text = useTitleText();
		var counts = getCounts( text );

		useTitleBadge( POST_TITLE_SELECTOR, getBadgeLabel( counts ) );

		if ( ! PluginDocumentSettingPanel ) {
			return null;
		}

		return el(
			PluginDocumentSettingPanel,
			{
				name: 'title-word-count',
				title: __( 'Title word count', 'title-word-count' ),
				className: 'title-word-count__panel',
			},
			el( CountStats, { counts: counts } )
		);
	}

	if ( registerPlugin ) {
		registerPlugin( 'title-word-count', {
			render: PostTitleWordCount,
		} );
	}

	/**
	 * Public surface, for reuse elsewhere in the editor.
	 *
	 *   titleWordCount.isNewPost()            // imperative, one-shot
	 *   titleWordCount.useIsNewPost()         // hook, re-renders on change
	 *   titleWordCount.getCounts( 'A title' ) // { words, characters… }
	 *
	 * Both post helpers accept an optional block context object
	 * (`{ postId, postType }`) for the site editor / Query Loop case.
	 */
	window.titleWordCount = {
		isNewPost: isNewPost,
		useIsNewPost: useIsNewPost,
		getCounts: getCounts,
		getBadgeLabel: getBadgeLabel,
		useTitleText: useTitleText,
	};
} )( window.wp );
