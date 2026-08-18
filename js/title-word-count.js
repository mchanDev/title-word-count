/**
 * Title Word Count
 *
 * Adds a live word / character count to the core Post Title block
 * (`core/post-title`) inside the editor.
 *
 * Counting is done by `@wordpress/wordcount` (exposed on `wp.wordcount`), whose
 * `count( text, type, userSettings )` signature is documented at
 * https://developer.wordpress.org/block-editor/reference-guides/packages/packages-wordcount/
 *
 * Two block filters are used, both from
 * https://developer.wordpress.org/block-editor/reference-guides/filters/block-filters/
 *
 *   1. `editor.BlockEdit`       – wraps the block's edit component so a
 *                                 "Word count" panel can be added to the
 *                                 inspector sidebar.
 *   2. `editor.BlockListBlock`  – wraps the block's list wrapper so the count
 *                                 can be exposed as a `data-` attribute that
 *                                 CSS renders as an inline badge.
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
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;
	var useSelect = wp.data.useSelect;
	var count = wp.wordcount.count;
	var __ = wp.i18n.__;
	var _n = wp.i18n._n;
	var sprintf = wp.i18n.sprintf;

	/** The block we are augmenting. */
	var TARGET_BLOCK = 'core/post-title';

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
	 * One row of the inspector panel.
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
	 * Inspector panel listing the counts.
	 *
	 * @param {Object} props        Component props.
	 * @param {Object} props.counts Counts to render.
	 * @return {Object} Element.
	 */
	function WordCountPanel( props ) {
		var counts = props.counts;

		return el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{
					title: __( 'Title word count', 'title-word-count' ),
					initialOpen: true,
				},
				el(
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
				)
			)
		);
	}

	/**
	 * Renders the original edit component plus the inspector panel.
	 *
	 * Kept as its own component so the `useSelect` hook is only ever mounted for
	 * the target block — see the performance note on `editor.BlockEdit`.
	 *
	 * @param {Object} props Props, including the wrapped `BlockEdit`.
	 * @return {Object} Element.
	 */
	function TitleEditWithCount( props ) {
		var BlockEdit = props.BlockEdit;
		var text = useTitleText( props.context );
		var counts = getCounts( text );

		return el(
			Fragment,
			null,
			el( BlockEdit, props ),
			// Only mount the panel while the block is selected, so the sidebar
			// does not churn on every unrelated selection change.
			props.isSelected ? el( WordCountPanel, { counts: counts } ) : null
		);
	}

	/**
	 * `editor.BlockEdit` — add the inspector panel to the Post Title block.
	 */
	var withTitleWordCountPanel = createHigherOrderComponent( function (
		BlockEdit
	) {
		return function ( props ) {
			if ( props.name !== TARGET_BLOCK ) {
				return el( BlockEdit, props );
			}

			return el(
				TitleEditWithCount,
				Object.assign( {}, props, { BlockEdit: BlockEdit } )
			);
		};
	}, 'withTitleWordCountPanel' );

	addFilter(
		'editor.BlockEdit',
		'title-word-count/with-inspector-panel',
		withTitleWordCountPanel
	);

	/**
	 * Renders the block wrapper with the count exposed as a data attribute.
	 *
	 * @param {Object} props Props, including the wrapped `BlockListBlock`.
	 * @return {Object} Element.
	 */
	function TitleBlockWithBadge( props ) {
		var BlockListBlock = props.BlockListBlock;
		var text = useTitleText(
			props.context || ( props.block && props.block.context )
		);
		var label = getBadgeLabel( getCounts( text ) );

		var wrapperProps = Object.assign( {}, props.wrapperProps, {
			'data-title-word-count': label,
		} );

		return el(
			BlockListBlock,
			Object.assign( {}, props, {
				wrapperProps: wrapperProps,
				className: [ props.className, 'has-title-word-count' ]
					.filter( Boolean )
					.join( ' ' ),
			} )
		);
	}

	/**
	 * `editor.BlockListBlock` — expose the count on the block wrapper so CSS can
	 * render it as a badge above the title. Nothing is added to the editable DOM,
	 * so the badge can never be saved into the title.
	 */
	var withTitleWordCountBadge = createHigherOrderComponent( function (
		BlockListBlock
	) {
		return function ( props ) {
			if ( props.name !== TARGET_BLOCK ) {
				return el( BlockListBlock, props );
			}

			return el(
				TitleBlockWithBadge,
				Object.assign( {}, props, {
					BlockListBlock: BlockListBlock,
				} )
			);
		};
	}, 'withTitleWordCountBadge' );

	addFilter(
		'editor.BlockListBlock',
		'title-word-count/with-badge',
		withTitleWordCountBadge
	);
} )( window.wp );
