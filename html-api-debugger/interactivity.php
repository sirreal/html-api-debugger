<?php

namespace HTML_API_Debugger\Interactivity;

/**
 * Generate the WP Admin page HTML.
 *
 * @param $html The input html.
 * @return The page HTML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $html, array $options ): string {
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$htmlapi_response = \HTML_API_Debugger\prepare_html_result_object( $html, $options );

	wp_interactivity_config(
		\HTML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'html-api-debugger/v1/htmlapi' ),
			'nonce'        => wp_create_nonce( 'wp_rest' ),
		)
	);
	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
		array(
			'DOM'              => array(
				'renderingMode' => '',
				'title'         => '',
			),
			'html'             => $html,
			'htmlapiResponse'  => $htmlapi_response,
			'span'             => null,

			'showClosers'      => false,
			'showInvisible'    => false,
			'showVirtual'      => false,
			'quirksMode'       => false,
			'fullParser'       => false,

			'hoverInfo'        => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion'   => false,
		)
	);
	ob_start();
	?>
<table
	id="html-api-debugger-table"
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch--a="watch"
	data-wp-watch--b="watchDom"
	data-wp-run="run"
>
	<tbody>
		<tr>
			<td>
				<h2>Input HTML</h2>
				<textarea id='input_html' data-wp-on--input="handleChange"><?php echo "\n" . esc_textarea( str_replace( "\0", '', $html ) ); ?></textarea>
				<p data-wp-bind--hidden="!state.htmlPreambleForProcessing">
					Note: Because HTML API operates in body at this time, this will be prepended:
					<br>
					<code data-wp-text="state.htmlPreambleForProcessing"></code>
				</p>
			</td>
			<td>
				<h2>Rendered output</h2>
				<iframe
					data-wp-on--load="onRenderedIframeLoad"
					src="about:blank"
					id="rendered_iframe"
					referrerpolicy="no-referrer"
					sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
				<p>Title:&nbsp;<code data-wp-text="state.DOM.title"></code> Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code></p>
			</td>
		</tr>
		<tr>
			<td><h2>Interpreted by HTML API</h2></td>
			<td><h2>Interpreted from DOM</h2></td>
		</tr>
		<tr>
			<td colspan="2">
				<div class="col-wrapper">
					<div class="col" data-wp-on--click="handleSpanClick" data-wp-class--showClosers="state.showClosers">
						<pre class="hide-on-empty error-holder" data-wp-text="state.htmlapiResponse.error"></pre>
						<ul id="html_api_result_holder" class="hide-on-empty" data-wp-ignore></ul>
					</div>
					<div class="col">
						<ul id="dom_tree" data-wp-ignore></ul>
					</div>
				</div>
			</td>
		</tr>
		<tr>
			<td><p>Click a node above to see its span details below.</p></td>
		</tr>
		<tr>
			<td colspan="2">
				<div>
					<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" data-wp-on--click="handleShowClosersClick"></label>
					<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" data-wp-on--click="handleShowInvisibleClick"></label>
					<span data-wp-bind--hidden="!state.htmlapiResponse.supports.is_virtual"><label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" data-wp-on--click="handleShowVirtualClick"></label></span>
					<span data-wp-bind--hidden="!state.htmlapiResponse.supports.quirks_mode"><label>Quirks mode <input type="checkbox" data-wp-bind--checked="state.quirksMode" data-wp-on--click="handleQuirksModeClick"></label></span>
					<span data-wp-bind--hidden="!state.htmlapiResponse.supports.full_parser"><label>Full parser <input type="checkbox" data-wp-bind--checked="state.fullParser" data-wp-on--click="handleFullParserClick"></label></span>
				</div>
				<div>
					<label>
						Hover information
						<select data-wp-on--change="hoverInfoChange">
							<option data-wp-bind--selected="state.hoverBreadcrumbs" value="breadcrumbs">(depth) Breadcrumbs…</option>
							<option data-wp-bind--selected="state.hoverInsertion" value="insertionMode">Insertion mode</option>
						</select>
					</label>
				</div>
			</td>
		</tr>
		<tr data-wp-bind--hidden="state.span">
			<td colspan="2">
				<h2>Processed HTML</h2>
				<pre class="html-text" data-wp-text="state.hoverSpan"></pre>
			</td>
		</tr>
		<tr data-wp-bind--hidden="!state.span">
			<td colspan="2">
				<h2>Processed HTML selected span</h2>
				<button data-wp-on--click="clearSpan" type="button">Clear span selection 🧹</button>
				<div class="htmlSpanContainer">
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.0"></pre>
					<pre class="html-text html-span html selected span" data-wp-text="state.hoverSpanSplit.1"></pre>
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.2"></pre>
				</div>
			</td>
		</tr>
		<tr>
			<td>
				<p>
					<button data-wp-on--click="handleCopyClick" type="button">Copy shareable playground link</button>
				</p>
				<details>
					<summary>debug response</summary>
					<pre data-wp-text="state.formattedHtmlapiResponse"></pre>
				</details>
			</td>
		</tr>
	</tbody>
</table>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}
