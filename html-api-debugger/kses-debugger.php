<?php
/**
 * KSES debugger admin page.
 *
 * A second admin page for working on the KSES Tag Processor PR,
 * WordPress/wordpress-develop#13271.
 *
 * When `wp_sanitize_html_kses()` exists the page runs both implementations and
 * shows both outputs. Otherwise it runs `wp_kses()` alone and shows one.
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger\KSES_Debugger;

use HTML_API_Debugger\HTML_API_Integration;
use ReflectionException;
use ReflectionFunction;
use Throwable;
use WP_REST_Request;

const SLUG = 'kses-debugger';

/**
 * Contexts accepted by wp_kses_allowed_html().
 */
const CONTEXTS = array(
	'post',
	'data',
	'strip',
	'entities',
	'user_description',
	'pre_user_description',
	'pre_term_description',
);

const DEFAULT_CONTEXT = 'post';

/** Set up the KSES debugger page. */
function init() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;

	add_action(
		'rest_api_init',
		function () {
			register_rest_route(
				SLUG . '/v1',
				'/kses',
				array(
					'methods' => 'POST',
					'callback' => function ( WP_REST_Request $request ) {
						$params = $request->get_json_params();
						$html = isset( $params['html'] ) && \is_string( $params['html'] ) ? $params['html'] : '';
						$context = isset( $params['context'] ) && \is_string( $params['context'] ) ? $params['context'] : DEFAULT_CONTEXT;
						return prepare_result_object( $html, $context );
					},
					'permission_callback' => function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);
		}
	);

	wp_register_script_module(
		'@html-api-debugger/kses-main',
		plugins_url( 'kses-main.mjs', __FILE__ ),
		array(
			'@wordpress/interactivity',
			'@html-api-debugger/print-html-tree',
			'@html-api-debugger/replace-invisible-chars',
		),
		asset_version( 'kses-main.mjs' )
	);

	/*
	 * Priority 11 so the parent menu page, registered at the default priority,
	 * already exists. Otherwise add_submenu_page() cannot add the link back to
	 * the parent as the submenu's first item.
	 */
	add_action(
		'admin_menu',
		function () {
			$hook_suffix = add_submenu_page(
				\HTML_API_Debugger\SLUG,
				'KSES Debugger',
				'KSES Debugger',
				'edit_posts',
				SLUG,
				__NAMESPACE__ . '\\render_page'
			);

			if ( ! $hook_suffix ) {
				return;
			}

			add_action(
				'admin_enqueue_scripts',
				function ( $current_hook_suffix ) use ( $hook_suffix ) {
					if ( $current_hook_suffix === $hook_suffix ) {
						wp_enqueue_style(
							SLUG,
							plugins_url( 'style.css', __FILE__ ),
							array(),
							asset_version( 'style.css' )
						);
						wp_enqueue_script_module( '@html-api-debugger/kses-main' );
					}
				}
			);
		},
		11
	);
}

/**
 * Version an asset by its modification time.
 *
 * This page is edited while it is open, so the plugin's release version is
 * useless as a cache buster: the URL would never change and a stale stylesheet
 * or module would be served after every edit.
 *
 * @param string $file File name, relative to this directory.
 */
function asset_version( string $file ): string {
	$mtime = @filemtime( __DIR__ . '/' . $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
	return false === $mtime ? \HTML_API_Debugger\VERSION : (string) $mtime;
}

/** Render the admin page. */
function render_page() {
	$html = '';
	$context = DEFAULT_CONTEXT;

	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if ( isset( $_GET['html'] ) && \is_string( $_GET['html'] ) ) {
		$html = stripslashes( $_GET['html'] );
	}
	if ( isset( $_GET['context'] ) && \is_string( $_GET['context'] ) && \in_array( $_GET['context'], CONTEXTS, true ) ) {
		$context = $_GET['context'];
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended

	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo generate_page( $html, $context );
}

/**
 * Report which KSES implementations this WordPress build offers.
 */
function get_supports(): array {
	$has_html_api_kses = \function_exists( 'wp_sanitize_html_kses' );

	return array(
		/** Both implementations are available, so two outputs are shown. */
		'dual' => $has_html_api_kses,
		/** `wp_kses()` can be pinned to the legacy parser through a filter. */
		'forceLegacyFilter' => $has_html_api_kses && wp_kses_reads_force_legacy_filter(),
	);
}

/**
 * Whether `wp_kses()` consults the `wp_kses_force_legacy_parser` filter.
 *
 * Early revisions of the PR made `wp_kses()` delegate to
 * `wp_sanitize_html_kses()` unconditionally. On such a build the legacy output
 * cannot be obtained through `wp_kses()` and both outputs are the same.
 */
function wp_kses_reads_force_legacy_filter(): bool {
	static $result = null;
	if ( null !== $result ) {
		return $result;
	}

	$result = false;
	try {
		$reflection = new ReflectionFunction( 'wp_kses' );
		$file = $reflection->getFileName();
		$start = $reflection->getStartLine();
		$end = $reflection->getEndLine();
		if ( \is_string( $file ) && \is_int( $start ) && \is_int( $end ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file
			$lines = file( $file );
			if ( \is_array( $lines ) ) {
				$source = implode( '', \array_slice( $lines, $start - 1, $end - $start + 1 ) );
				$result = str_contains( $source, 'wp_kses_force_legacy_parser' );
			}
		}
	} catch ( ReflectionException $e ) {
		$result = false;
	}

	return $result;
}

/**
 * Run a KSES implementation, capturing errors and PHP diagnostics.
 *
 * @param callable $run Returns the filtered HTML.
 * @return array{html: string|null, error: string|null, diagnostics: string[]}
 */
function run_capturing( callable $run ): array {
	$diagnostics = array();

	// phpcs:ignore WordPress.PHP.DevelopmentFunctions.prevent_path_disclosure_set_error_handler
	set_error_handler(
		function ( $errno, $errstr, $errfile, $errline ) use ( &$diagnostics ) {
			$diagnostics[] = "{$errstr} in {$errfile}:{$errline}";
			return true;
		}
	);

	$html = null;
	$error = null;
	try {
		$html = $run();
	} catch ( Throwable $e ) {
		$error = (string) $e;
	} finally {
		restore_error_handler();
	}

	return array(
		'html' => $html,
		'error' => $error,
		'diagnostics' => $diagnostics,
	);
}

/**
 * Parse some HTML with `parse_blocks()`.
 *
 * Returns a node tree in the same shape `print-html-tree.mjs` renders for the
 * HTML API, so the same renderer and styles apply: a block becomes an element
 * named after its block type carrying its parsed attributes, and a span of
 * inner HTML becomes a text node.
 *
 * @param string|null $html The HTML, or null when the implementation failed.
 * @return array{tree: array|null, error: string|null}
 */
function get_block_tree( ?string $html ): array {
	if ( null === $html ) {
		return array(
			'tree' => null,
			'error' => null,
		);
	}

	if ( ! \function_exists( 'parse_blocks' ) ) {
		return array(
			'tree' => null,
			'error' => 'parse_blocks() does not exist in this WordPress build.',
		);
	}

	try {
		$blocks = parse_blocks( $html );
	} catch ( Throwable $e ) {
		return array(
			'tree' => null,
			'error' => (string) $e,
		);
	}

	return array(
		'tree' => array(
			'nodeType' => HTML_API_Integration\NODE_TYPE_DOCUMENT,
			'nodeName' => '#document',
			'childNodes' => array_map( __NAMESPACE__ . '\\block_to_node', $blocks ),
		),
		'error' => null,
	);
}

/**
 * Convert one `parse_blocks()` block into a tree node.
 *
 * @param array $block A block as returned by parse_blocks().
 */
function block_to_node( array $block ): array {
	$attributes = array();
	foreach ( (array) ( $block['attrs'] ?? array() ) as $name => $value ) {
		$attributes[] = array(
			'nodeType' => HTML_API_Integration\NODE_TYPE_ATTRIBUTE,
			'specified' => true,
			'nodeName' => (string) $name,
			'nodeValue' => \is_string( $value ) ? $value : wp_json_encode( $value ),
		);
	}

	$inner_blocks = (array) ( $block['innerBlocks'] ?? array() );
	$next_inner_block = 0;
	$children = array();

	/*
	 * `innerContent` interleaves literal HTML with a null for each inner block,
	 * so walking it keeps the inner HTML and inner blocks in source order.
	 */
	foreach ( (array) ( $block['innerContent'] ?? array() ) as $chunk ) {
		if ( null === $chunk ) {
			if ( isset( $inner_blocks[ $next_inner_block ] ) ) {
				$children[] = block_to_node( $inner_blocks[ $next_inner_block ] );
				++$next_inner_block;
			}
			continue;
		}

		if ( '' !== $chunk ) {
			$children[] = array(
				'nodeType' => HTML_API_Integration\NODE_TYPE_TEXT,
				'nodeName' => '#html',
				'nodeValue' => $chunk,
			);
		}
	}

	// An inner block that `innerContent` never referenced still belongs here.
	for ( ; isset( $inner_blocks[ $next_inner_block ] ); ++$next_inner_block ) {
		$children[] = block_to_node( $inner_blocks[ $next_inner_block ] );
	}

	return array(
		'nodeType' => HTML_API_Integration\NODE_TYPE_ELEMENT,
		'nodeName' => $block['blockName'] ?? '#freeform',
		'attributes' => $attributes,
		'childNodes' => $children,
	);
}

/**
 * Compare the two block recognizers over the same bytes.
 *
 * `parse_blocks()` uses `WP_Block_Parser`'s regex, whose attribute span has no
 * notion of a comment ending, so it spans `-->`, `--!>` and `--->`.
 * `WP_Block_Processor` scans for a hardcoded `-->`, so it spans `--!>` only.
 * Where the two disagree, a delimiter that KSES declines to filter can still be
 * a block at render time. That is the shape of the reported bypass, and it needs
 * no mutation: the bytes are identical in and out.
 *
 * @param string|null $html The HTML, or null when the implementation failed.
 * @return array{parseBlocks: string[], blockProcessor: string[]|null, disagree: bool, error: string|null}
 */
function get_block_recognizers( ?string $html ): array {
	$result = array(
		'parseBlocks' => array(),
		'blockProcessor' => null,
		'disagree' => false,
		'error' => null,
	);

	if ( null === $html ) {
		return $result;
	}

	if ( \function_exists( 'parse_blocks' ) ) {
		try {
			$result['parseBlocks'] = collect_parsed_block_names( parse_blocks( $html ) );
		} catch ( Throwable $e ) {
			$result['error'] = (string) $e;
			return $result;
		}
	} else {
		$result['error'] = 'parse_blocks() does not exist in this WordPress build.';
		return $result;
	}

	if ( ! class_exists( 'WP_Block_Processor' ) ) {
		return $result;
	}

	try {
		$processor = new \WP_Block_Processor( $html );
		$found = array();
		while ( $processor->next_token() ) {
			if ( $processor->is_html() ) {
				continue;
			}
			if ( \WP_Block_Processor::CLOSER === $processor->get_delimiter_type() ) {
				continue;
			}
			$found[] = describe_block( $processor->get_printable_block_type(), $processor->allocate_and_return_parsed_attributes() );
		}
		$result['blockProcessor'] = $found;
		$result['disagree'] = $found !== $result['parseBlocks'];
	} catch ( Throwable $e ) {
		$result['error'] = (string) $e;
	}

	return $result;
}

/**
 * Collect a flat, depth-first list of the blocks `parse_blocks()` recognized.
 *
 * Freeform content carries a null `blockName` and is skipped: every stretch of
 * plain HTML produces one, so including them would hide the real blocks.
 *
 * @param array $blocks Blocks as returned by parse_blocks().
 * @return string[]
 */
function collect_parsed_block_names( array $blocks ): array {
	$names = array();

	foreach ( $blocks as $block ) {
		if ( isset( $block['blockName'] ) ) {
			$names[] = describe_block( $block['blockName'], $block['attrs'] ?? null );
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$names = array_merge( $names, collect_parsed_block_names( $block['innerBlocks'] ) );
		}
	}

	return $names;
}

/**
 * Describe one recognized block compactly, for comparing the two recognizers.
 *
 * @param string|null $name       Block type.
 * @param array|null  $attributes Parsed attributes, if any.
 */
function describe_block( ?string $name, ?array $attributes ): string {
	$description = $name ?? '?';

	if ( null === $attributes || array() === $attributes ) {
		return $description;
	}

	$pairs = array();
	foreach ( $attributes as $key => $value ) {
		$pairs[] = $key . ':' . ( \is_string( $value ) ? $value : wp_json_encode( $value ) );
	}

	return $description . ' {' . implode( ', ', $pairs ) . '}';
}

/**
 * Filter the input with every available KSES implementation and parse each result.
 *
 * @param string $html    The input HTML.
 * @param string $context The KSES context passed as `$allowed_html`.
 */
function prepare_result_object( string $html, string $context ): array {
	$supports = get_supports();

	if ( ! \in_array( $context, CONTEXTS, true ) ) {
		$context = DEFAULT_CONTEXT;
	}

	$force_legacy = static function () {
		return true;
	};
	add_filter( 'wp_kses_force_legacy_parser', $force_legacy, PHP_INT_MAX );
	$legacy = run_capturing(
		static function () use ( $html, $context ) {
			return wp_kses( $html, $context );
		}
	);
	remove_filter( 'wp_kses_force_legacy_parser', $force_legacy, PHP_INT_MAX );

	$html_api = $supports['dual']
		? run_capturing(
			static function () use ( $html, $context ) {
				return wp_sanitize_html_kses( $html, $context );
			}
		)
		: array(
			'html' => null,
			'error' => null,
			'diagnostics' => array(),
		);

	$notices = array();
	if ( $supports['dual'] && ! $supports['forceLegacyFilter'] ) {
		$notices[] = 'This build\'s wp_kses() does not read the wp_kses_force_legacy_parser filter, so it delegates to wp_sanitize_html_kses() and both outputs come from the HTML API implementation.';
	}
	if ( ! $supports['dual'] ) {
		$notices[] = 'wp_sanitize_html_kses() is not defined, so only the legacy wp_kses() output is shown. Load a WordPress build with WordPress/wordpress-develop#13271 applied to compare the two.';
	}

	$legacy['blocks'] = get_block_tree( $legacy['html'] );
	$legacy['recognizers'] = get_block_recognizers( $legacy['html'] );
	$html_api['blocks'] = get_block_tree( $html_api['html'] );
	$html_api['recognizers'] = get_block_recognizers( $html_api['html'] );

	return array(
		'supports' => $supports,
		'html' => $html,
		'context' => $context,
		'notices' => $notices,
		'input' => array(
			'blocks' => get_block_tree( $html ),
			'recognizers' => get_block_recognizers( $html ),
		),
		'legacy' => $legacy,
		'htmlApi' => $html_api,
	);
}

/**
 * Escape a KSES output for printing as text.
 *
 * `esc_html()` cannot be used here. It calls `_wp_specialchars()` with
 * `$double_encode = false`, so an output containing `&lt;` would be printed
 * unchanged and render as `<`, hiding the entity KSES produced. The exact
 * output bytes are the point of this page, so every `&` is encoded.
 *
 * @param string|null $html The filtered HTML, or null when the run failed.
 */
function escape_output( ?string $html ): string {
	if ( null === $html ) {
		return '';
	}

	return htmlspecialchars(
		str_replace( "\0", '', $html ),
		ENT_QUOTES | ENT_SUBSTITUTE,
		'UTF-8'
	);
}

/**
 * Generate the KSES debugger page HTML.
 *
 * @param string $html    The input HTML.
 * @param string $context The KSES context.
 * @return string The page HTML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $html, string $context ): string {
	$result = prepare_result_object( $html, $context );

	wp_interactivity_config(
		SLUG,
		array(
			'restEndpoint' => rest_url( SLUG . '/v1/kses' ),
			'nonce' => wp_create_nonce( 'wp_rest' ),
		)
	);

	wp_interactivity_state(
		SLUG,
		array(
			'html' => $html,
			'ksesContext' => $result['context'],
			'ksesResponse' => $result,

			'showClosers' => false,
			'showInvisible' => false,
			'showVirtual' => false,

			'requestError' => null,
		)
	);

	/** The output panes and the tree panes both gain a column when both implementations exist. */
	$columns = $result['supports']['dual'] ? 2 : 1;

	/*
	 * One column per implementation, plus the input. `dual` cannot change while
	 * the page is open, so the third column is omitted entirely rather than
	 * hidden: a `display: none` grid cell would shift every later row.
	 */
	$panes = array(
		array(
			'id' => 'input',
			'function' => null,
			'label' => 'Input',
			'html' => $html,
			'run_error' => null,
			'blocks_error' => 'state.ksesResponse.input.blocks.error',
			'recognizers' => 'state.ksesResponse.input.recognizers',
		),
		array(
			'id' => 'legacy',
			'function' => 'wp_kses()',
			'label' => 'legacy parser',
			'html' => $result['legacy']['html'],
			'run_error' => 'state.ksesResponse.legacy.error',
			'blocks_error' => 'state.ksesResponse.legacy.blocks.error',
			'recognizers' => 'state.ksesResponse.legacy.recognizers',
		),
	);
	if ( $result['supports']['dual'] ) {
		$panes[] = array(
			'id' => 'html-api',
			'function' => 'wp_sanitize_html_kses()',
			'label' => 'Tag Processor',
			'html' => $result['htmlApi']['html'],
			'run_error' => 'state.ksesResponse.htmlApi.error',
			'blocks_error' => 'state.ksesResponse.htmlApi.blocks.error',
			'recognizers' => 'state.ksesResponse.htmlApi.recognizers',
		);
	}

	ob_start();
	?>
<div
	data-wp-interactive="<?php echo esc_attr( SLUG ); ?>"
	data-wp-watch="watch"
	data-wp-init="run"
	class="html-api-debugger-container kses-debugger"
>
	<h1>KSES Debugger</h1>

	<template data-wp-each="state.ksesResponse.notices">
		<p class="notice notice-warning kses-debugger__notice" data-wp-text="context.item"></p>
	</template>
	<p class="error-holder" data-wp-bind--hidden="!state.requestError" data-wp-text="state.requestError"></p>

	<div class="kses-debugger__controls">
		<label>
			Allowed HTML context
			<select data-wp-on-async--change="handleContextChange">
				<?php foreach ( CONTEXTS as $context_option ) : ?>
				<option
					value="<?php echo esc_attr( $context_option ); ?>"
					<?php selected( $context_option, $result['context'] ); ?>
				><?php echo esc_html( $context_option ); ?></option>
				<?php endforeach; ?>
		</select>
		</label>
		<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" data-wp-on-async--input="handleShowClosersClick"></label>
		<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" data-wp-on-async--input="handleShowInvisibleClick"></label>
		<label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" data-wp-on-async--input="handleShowVirtualClick"></label>
	</div>

	<h2><label for="kses-input-html">Input HTML</label></h2>
	<textarea
		id="kses-input-html"
		class="kses-debugger__input"
		autocapitalize="off"
		autocomplete="off"
		spellcheck="false"
		wrap="off"
		rows="8"
		data-wp-on-async--input="handleInput"
	><?php echo "\n" . esc_textarea( str_replace( "\0", '', $html ) ); ?></textarea>

	<?php /* The column count is page data, so it is set where it is known. */ ?>
	<div
		class="kses-debugger__grid"
		style="grid-template-columns: repeat(<?php echo \count( $panes ); ?>, minmax(0, 1fr))"
	>
		<?php foreach ( $panes as $pane ) : ?>
		<h2 class="kses-debugger__column-heading">
			<?php if ( $pane['function'] ) : ?>
			<code><?php echo esc_html( $pane['function'] ); ?></code>
			<?php endif; ?>
			<?php echo esc_html( $pane['label'] ); ?>
		</h2>
		<?php endforeach; ?>

		<h3 class="kses-debugger__row-heading">Output bytes</h3>
		<?php foreach ( $panes as $pane ) : ?>
		<div>
			<?php if ( $pane['run_error'] ) : ?>
			<pre
				class="error-holder"
				data-wp-bind--hidden="!<?php echo esc_attr( $pane['run_error'] ); ?>"
				data-wp-text="<?php echo esc_attr( $pane['run_error'] ); ?>"
			></pre>
			<?php endif; ?>
			<pre class="html-text" id="kses-output-<?php echo esc_attr( $pane['id'] ); ?>" data-wp-ignore><?php echo escape_output( $pane['html'] ); ?></pre>
		</div>
		<?php endforeach; ?>

		<h3 class="kses-debugger__row-heading">Block recognizers</h3>
		<?php foreach ( $panes as $pane ) : ?>
		<div class="kses-debugger__recognizers" id="kses-recognizers-<?php echo esc_attr( $pane['id'] ); ?>" data-wp-ignore></div>
		<?php endforeach; ?>

		<h3 class="kses-debugger__row-heading">Parsed by <code>parse_blocks()</code></h3>
		<?php foreach ( $panes as $pane ) : ?>
		<div>
			<button type="button" data-wp-on-async--click="handleCopyTreeClick" name="blocks__<?php echo esc_attr( $pane['id'] ); ?>">Copy tree 📋</button>
			<pre
				class="error-holder"
				data-wp-bind--hidden="!<?php echo esc_attr( $pane['blocks_error'] ); ?>"
				data-wp-text="<?php echo esc_attr( $pane['blocks_error'] ); ?>"
			></pre>
			<ul id="kses-blocks-<?php echo esc_attr( $pane['id'] ); ?>" class="html-api-debugger--tree" data-wp-ignore></ul>
		</div>
		<?php endforeach; ?>

		<h3 class="kses-debugger__row-heading">Rendered in an iframe</h3>
		<?php foreach ( $panes as $pane ) : ?>
		<div class="iframe-container">
			<iframe
				class="kses-debugger__iframe"
				id="kses-iframe-<?php echo esc_attr( $pane['id'] ); ?>"
				src="about:blank"
				referrerpolicy="no-referrer"
				sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
		</div>
		<?php endforeach; ?>

		<h3 class="kses-debugger__row-heading">Interpreted from the DOM</h3>
		<?php foreach ( $panes as $pane ) : ?>
		<div>
			<div class="heading-and-button">
					<button type="button" data-wp-on-async--click="handleCopyTreeClick" name="dom__<?php echo esc_attr( $pane['id'] ); ?>">Copy 📋</button>
			</div>
			<ul id="kses-dom-tree-<?php echo esc_attr( $pane['id'] ); ?>" class="html-api-debugger--tree" data-wp-ignore></ul>
		</div>
		<?php endforeach; ?>
	</div>

	<details>
		<summary>debug response</summary>
		<pre data-wp-text="state.formattedKsesResponse"></pre>
	</details>
</div>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}

add_action( 'init', __NAMESPACE__ . '\\init' );
