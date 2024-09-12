<?php
namespace HTML_API_Debugger\Interactivity;

/**
 * Make an "on" directive
 *
 * Depending on supported behavior, this can be sync or async.
 *
 * @param string $on The event name.
 * @param string $directive The directive name.
 */
function wp_on_directive( string $on, string $directive ): void {
	static $supports_async_on = null;
	if ( null === $supports_async_on ) {
		$supports_async_on = version_compare( get_bloginfo( 'version' ), '6.6', '>=' );
	}

	echo $supports_async_on ?
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		"data-wp-on-async--{$on}=\"{$directive}\"" :
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		"data-wp-on--{$on}=\"{$directive}\"";
}

/**
 * Generate the WP Admin page HTML.
 *
 * @param string $html The input html.
 * @param array  $options The input html.
 * @return The page HTML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $html, array $options ): string {
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$htmlapi_response = \HTML_API_Debugger\prepare_html_result_object( $html, $options );

	wp_interactivity_config(
		\HTML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'html-api-debugger/v1/htmlapi' ),
			'nonce' => wp_create_nonce( 'wp_rest' ),
		)
	);
	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
		array(
			'DOM' => array(
				'renderingMode' => '',
				'doctypeName' => '',
				'doctypeSystemId' => '',
				'doctypePublicId' => '',
			),
			'html' => $html,
			'htmlapiResponse' => $htmlapi_response,
			'span' => false,
			'hoverSpan' => $htmlapi_response['html'],

			'showClosers' => false,
			'showInvisible' => false,
			'showVirtual' => false,
			'quirksMode' => false,
			'fullParser' => false,

			'hoverInfo' => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion' => false,
			'checkingForPRPlaygroundLink' => false,

			'htmlApiDoctypeName' => $htmlapi_response['result']['doctypeName'] ?? '[unknown]',
			'htmlApiDoctypePublicId' => $htmlapi_response['result']['doctypePublicId'] ?? '[unknown]',
			'htmlApiDoctypeSytemId' => $htmlapi_response['result']['doctypeSystemId'] ?? '[unknown]',
			'normalizedHtml' => $htmlapi_response['normalizedHtml'] ?? '',
		)
	);
	ob_start();
	?>
<div
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch--a="watch"
	data-wp-watch--b="watchDom"
	data-wp-run="run"
	class="html-api-debugger-container html-api-debugger--grid"
>
	<div>
		<h2>Input HTML</h2>
		<textarea
			id='input_html'
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			wrap="off"
			<?php wp_on_directive( 'input', 'handleInput' ); ?>
		><?php echo "\n" . esc_textarea( str_replace( "\0", '', $html ) ); ?></textarea>
		<p data-wp-bind--hidden="!state.htmlPreambleForProcessing">
			Note: Because HTML API operates in body at this time, this will be prepended:
			<br>
			<code data-wp-text="state.htmlPreambleForProcessing"></code>
		</p>
	</div>
	<div>
		<h2>Rendered output</h2>
		<iframe
			<?php wp_on_directive( 'load', 'onRenderedIframeLoad' ); ?>
			src="about:blank"
			id="rendered_iframe"
			referrerpolicy="no-referrer"
			sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
	</div>
	<details class="full-width" data-wp-bind--hidden="!state.htmlapiResponse.supports.normalize">
		<summary>HTML API Normalized HTML</summary>
		<pre class="html-text" data-wp-text="state.normalizedHtml"></pre>
	</details>
	<details class="full-width">
		<summary>Document info</summary>

		<div class="html-api-debugger--grid">
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.htmlapiResponse.result.compatMode"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.htmlApiDoctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.htmlApiDoctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.htmlApiDoctypeSystemId"></code>
			</div>
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.DOM.doctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.DOM.doctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.DOM.doctypeSystemId"></code>
			</div>
		</div>
	</details>
	<div class="full-width html-api-debugger--grid">
		<div>
			<h2>Interpreted by HTML API</h2>
			<div <?php wp_on_directive( 'click', 'handleSpanClick' ); ?>>
				<pre class="error-holder" data-wp-bind--hidden="!state.htmlapiResponse.error" data-wp-text="state.htmlapiResponse.error"></pre>
				<div data-wp-bind--hidden="state.htmlapiResponse.error">
					<ul id="html_api_result_holder" data-wp-ignore></ul>
				</div>
			</div>
			<p>Click a node above to see its span details below.</p>
		</div>
		<div>
			<h2>Interpreted from DOM</h2>
			<ul id="dom_tree" data-wp-ignore></ul>
		</div>
	</div>

	<div class="full-width">
		<div>
			<div>
				<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" <?php wp_on_directive( 'input', 'handleShowClosersClick' ); ?>></label>
				<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" <?php wp_on_directive( 'input', 'handleShowInvisibleClick' ); ?>></label>
				<span data-wp-bind--hidden="!state.htmlapiResponse.supports.is_virtual"><label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" <?php wp_on_directive( 'input', 'handleShowVirtualClick' ); ?>></label></span>
				<span data-wp-bind--hidden="!state.htmlapiResponse.supports.quirks_mode"><label>Quirks mode <input type="checkbox" data-wp-bind--checked="state.quirksMode" <?php wp_on_directive( 'input', 'handleQuirksModeClick' ); ?>></label></span>
				<span data-wp-bind--hidden="!state.htmlapiResponse.supports.full_parser"><label>Full parser <input type="checkbox" data-wp-bind--checked="state.fullParser" <?php wp_on_directive( 'input', 'handleFullParserClick' ); ?>></label></span>
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
		</div>

		<div>
			<div data-wp-bind--hidden="state.span">
				<h2>Processed HTML</h2>
				<pre class="html-text" data-wp-text="state.hoverSpan"></pre>
			</div>

			<div data-wp-bind--hidden="!state.span">
				<h2>Processed HTML selected span</h2>
				<button <?php wp_on_directive( 'click', 'clearSpan' ); ?> type="button">Clear span selection 🧹</button>
				<div class="htmlSpanContainer">
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.0"></pre>
					<pre class="html-text html-span html selected span" data-wp-text="state.hoverSpanSplit.1"></pre>
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.2"></pre>
				</div>
			</div>
		</div>

		<div>
			<p>
				<label>
					<select id="htmlapi-wp-version">
						<option value="latest">latest</option>
						<option value="beta">beta</option>
						<option value="nightly">nightly</option>
					</select>
				</label>
				<button <?php wp_on_directive( 'click', 'handleCopyClick' ); ?> type="button">Copy shareable playground link</button><br>
				<label>
					<code>wordpress/develop</code> PR number:
					<input type="number" min="1" <?php wp_on_directive( 'input', 'handleCopyPrInput' ); ?>>
				</label>
				<button <?php wp_on_directive( 'click', 'handleCopyPrClick' ); ?>>Copy shareable playground link to PR</button>
				<button <?php wp_on_directive( 'click', 'handleCheckPrClick' ); ?> data-wp-bind--disabled="state.checkingForPRPlaygroundLink">Check PR</button>
			</p>
			<details>
				<summary>debug response</summary>
				<pre data-wp-text="state.formattedHtmlapiResponse"></pre>
			</details>
		</div>
	</div>
</div>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}
