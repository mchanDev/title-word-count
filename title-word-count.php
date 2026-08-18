<?php
/**
 * Plugin Name:       Title Word Count
 * Description:       Adds a live word/character count to the core Post Title block in the editor, using @wordpress/wordcount and the editor.BlockEdit / editor.BlockListBlock block filters.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * License:           GPL-2.0-or-later
 * Text Domain:       title-word-count
 *
 * @package TitleWordCount
 */

namespace TitleWordCount;

defined( 'ABSPATH' ) || exit;

/**
 * Enqueue the editor-only script that registers the block filters.
 *
 * `enqueue_block_editor_assets` fires for the post editor, the site editor and
 * any other screen that boots the block editor, which is exactly the scope we
 * want: the filters must never load on the front end.
 */
function enqueue_editor_assets(): void {
	$handle = 'title-word-count-editor';
	$path   = plugin_dir_path( __FILE__ ) . 'js/title-word-count.js';
	$deps   = array(
		'wp-block-editor',
		'wp-components',
		'wp-compose',
		'wp-data',
		'wp-element',
		'wp-hooks',
		'wp-i18n',
		'wp-wordcount', // Ships with WordPress; exposes wp.wordcount.count().
	);

	wp_enqueue_script(
		$handle,
		plugins_url( 'js/title-word-count.js', __FILE__ ),
		$deps,
		file_exists( $path ) ? (string) filemtime( $path ) : '1.0.0',
		true
	);

	wp_set_script_translations( $handle, 'title-word-count' );

	// The word counter needs the locale's regexes to count non-Latin scripts
	// correctly. Core already localises these for the classic counter.
	if ( function_exists( 'wp_get_word_count_type' ) ) {
		wp_localize_script(
			$handle,
			'wordCountL10n',
			array(
				'type' => wp_get_word_count_type(),
			)
		);
	}

	wp_enqueue_style(
		'title-word-count-editor',
		plugins_url( 'css/title-word-count.css', __FILE__ ),
		array(),
		file_exists( plugin_dir_path( __FILE__ ) . 'css/title-word-count.css' )
			? (string) filemtime( plugin_dir_path( __FILE__ ) . 'css/title-word-count.css' )
			: '1.0.0'
	);
}
add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\enqueue_editor_assets' );
