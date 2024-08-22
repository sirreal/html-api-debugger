<?php

namespace XML_API_Debugger\Interactivity;

function wp_on_directive( string $on, string $directive ): void {
	static $supports_async_on = null;
	if ( null === $supports_async_on ) {
		$supports_async_on = version_compare( get_bloginfo( 'version' ), '6.6', '>=' );
	}
	echo $supports_async_on ?
		"data-wp-on-async--{$on}=\"{$directive}\"" :
		"data-wp-on--{$on}=\"{$directive}\"";
}

/**
 * Generate the WP Admin page XML.
 *
 * @param $xml The input XML.
 * @return The page XML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $xml, array $options ): string {
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$xmlapi_response = \XML_API_Debugger\prepare_xml_result_object( $xml, $options );

	wp_interactivity_config(
		\XML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'xml-api-debugger/v1/xmlapi' ),
			'nonce'        => wp_create_nonce( 'wp_rest' ),
		)
	);
	wp_interactivity_state(
		\XML_API_Debugger\SLUG,
		array(
			'DOM'              => array(
				'renderingMode' => '',
				'title'         => '',
			),
			'xml'              => $xml,
			'xmlapiResponse'   => $xmlapi_response,
			'span'             => null,

			'showClosers'      => false,
			'showInvisible'    => false,
			'showVirtual'      => false,

			'hoverInfo'        => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion'   => false,
		)
	);
	ob_start();
	?>
<table
	id="xml-api-debugger-table"
	data-wp-interactive="<?php echo esc_attr( \XML_API_Debugger\SLUG ); ?>"
	data-wp-watch--a="watch"
	data-wp-watch--b="watchDom"
	data-wp-run="run"
>
	<tbody>
		<tr>
			<td>
				<h2>Input XML</h2>
				<textarea
					id='input_xml'
					autocapitalize="off"
					autocomplete="off"
					spellcheck="false"
					wrap="off"
					<?php wp_on_directive( 'input', 'handleChange' ); ?>
				><?php echo "\n" . esc_textarea( str_replace( "\0", '', $xml ) ); ?></textarea>
			</td>
			<td>
				<h2>Rendered output</h2>
				<iframe
					<?php wp_on_directive( 'load', 'onRenderedIframeLoad' ); ?>
					src="about:blank"
					id="rendered_iframe"
					referrerpolicy="no-referrer"
					sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
				<p>Title:&nbsp;<code data-wp-text="state.DOM.title"></code> Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code></p>
			</td>
		</tr>
		<tr>
			<td><h2>Interpreted by XML API</h2></td>
			<td><h2>Interpreted from DOM</h2></td>
		</tr>
		<tr>
			<td colspan="2">
				<div class="col-wrapper">
					<div
						class="col"
						data-wp-class--showClosers="state.showClosers"
						<?php wp_on_directive( 'click', 'handleSpanClick' ); ?>
					>
						<pre class="hide-on-empty error-holder" data-wp-text="state.xmlapiResponse.error"></pre>
						<ul id="xml_api_result_holder" class="hide-on-empty" data-wp-ignore></ul>
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
					<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" <?php wp_on_directive( 'input', 'handleShowClosersClick' ); ?>></label>
					<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" <?php wp_on_directive( 'input', 'handleShowInvisibleClick' ); ?>></label>
					<span data-wp-bind--hidden="!state.xmlapiResponse.supports.is_virtual"><label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" <?php wp_on_directive( 'input', 'handleShowVirtualClick' ); ?>></label></span>
					<span data-wp-bind--hidden="!state.xmlapiResponse.supports.quirks_mode"><label>Quirks mode <input type="checkbox" data-wp-bind--checked="state.quirksMode" <?php wp_on_directive( 'input', 'handleQuirksModeClick' ); ?>></label></span>
					<span data-wp-bind--hidden="!state.xmlapiResponse.supports.full_parser"><label>Full parser <input type="checkbox" data-wp-bind--checked="state.fullParser" <?php wp_on_directive( 'input', 'handleFullParserClick' ); ?>></label></span>
				</div>
				<div>
					<label>
						Hover information
						<select <?php wp_on_directive( 'change', 'hoverInfoChange' ); ?>>
							<option data-wp-bind--selected="state.hoverBreadcrumbs" value="breadcrumbs">(depth) Breadcrumbs…</option>
							<option data-wp-bind--selected="state.hoverInsertion" value="insertionMode">Insertion mode</option>
						</select>
					</label>
				</div>
			</td>
		</tr>
		<tr data-wp-bind--hidden="state.span">
			<td colspan="2">
				<h2>Processed XML</h2>
				<pre class="xml-text" data-wp-text="state.hoverSpan"></pre>
			</td>
		</tr>
		<tr data-wp-bind--hidden="!state.span">
			<td colspan="2">
				<h2>Processed XML selected span</h2>
				<button <?php wp_on_directive( 'click', 'clearSpan' ); ?> type="button">Clear span selection 🧹</button>
				<div class="xmlSpanContainer">
					<pre class="xml-text xml-span" data-wp-text="state.hoverSpanSplit.0"></pre>
					<pre class="xml-text xml-span xml selected span" data-wp-text="state.hoverSpanSplit.1"></pre>
					<pre class="xml-text xml-span" data-wp-text="state.hoverSpanSplit.2"></pre>
				</div>
			</td>
		</tr>
		<tr>
			<td>
				<p>
					<button <?php wp_on_directive( 'click', 'handleCopyClick' ); ?> type="button">Copy shareable playground link</button>
				</p>
				<details>
					<summary>debug response</summary>
					<pre data-wp-text="state.formattedXmlapiResponse"></pre>
				</details>
			</td>
		</tr>
	</tbody>
</table>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}
