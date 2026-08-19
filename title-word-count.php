<?php
/**
 * Plugin Name:       Title Word Count
 * Description:       Adds a live word/character count to the post title in the editor — both the core/post-title block (site editor, Query Loop) and the post editor's own title field — using @wordpress/wordcount.
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
 * Enqueue the editor-only script.
 *
 * `enqueue_block_editor_assets` fires for the post editor, the site editor and
 * any other screen that boots the block editor, which is exactly the scope we
 * want: the integration must never load on the front end.
 */
function enqueue_editor_assets(): void {
	$handle = 'title-word-count-editor';
	$path   = plugin_dir_path( __FILE__ ) . 'js/title-word-count.js';
	$deps   = array(
		'wp-block-editor',
		'wp-components',
		'wp-compose',
		'wp-data',
		'wp-editor',  // PluginDocumentSettingPanel, for the post editor title.
		'wp-element',
		'wp-hooks',
		'wp-i18n',
		'wp-plugins', // registerPlugin(), for the post editor title.
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

	// Sidebar panel styles. The inspector / document sidebar lives in the admin
	// document, so this hook is the right place for them.
	enqueue_plugin_style( 'title-word-count-editor' );
}
add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\enqueue_editor_assets' );

/**
 * Enqueue the stylesheet.
 *
 * @param string $handle Style handle to register under.
 */
function enqueue_plugin_style( string $handle ): void {
	$path = plugin_dir_path( __FILE__ ) . 'css/title-word-count.css';

	wp_enqueue_style(
		$handle,
		plugins_url( 'css/title-word-count.css', __FILE__ ),
		array(),
		file_exists( $path ) ? (string) filemtime( $path ) : '1.0.0'
	);
}

/**
 * Enqueue the badge styles inside the editor canvas.
 *
 * Since WordPress 6.3 the canvas is an iframe, and `enqueue_block_editor_assets`
 * only reaches the outer admin document. `enqueue_block_assets` is the hook
 * whose styles core replays into the iframe via `_wp_get_iframed_editor_assets()`,
 * so the post title — which lives in the canvas — can only be styled from here.
 *
 * The `is_admin()` guard keeps the badge off the front end.
 */
function enqueue_canvas_assets(): void {
	if ( ! is_admin() ) {
		return;
	}

	enqueue_plugin_style( 'title-word-count-canvas' );
}
add_action( 'enqueue_block_assets', __NAMESPACE__ . '\enqueue_canvas_assets' );
