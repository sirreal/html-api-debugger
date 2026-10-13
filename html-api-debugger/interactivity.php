<?php
namespace HTML_API_Debugger\Interactivity;

/**
 * Generate an input-independent WP Admin application shell.
 *
 * @return string Page HTML processed by the Interactivity API.
 */
function generate_page(): string {
	$supports = \HTML_API_Debugger\HTML_API_Integration\get_supports();

	wp_interactivity_config(
		\HTML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'html-api-debugger/v2/htmlapi' ),
			'nonce' => wp_create_nonce( 'wp_rest' ),
			'supports' => $supports,
		)
	);
	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
		array(
			'DOM' => array(
				'renderingMode' => '',
				'documentTitle' => '',
				'doctypeName' => '',
				'doctypeSystemId' => '',
				'doctypePublicId' => '',
				'contextNode' => '',
			),
			'hasMutatedDom' => false,
			'htmlapiResponse' => array(
				'supports' => $supports,
				'html' => '',
				'error' => null,
				'result' => null,
				'normalizedHtml' => null,
			),
			'htmlView' => 'text',
			'contextView' => 'text',
			'processedView' => 'text',
			'normalizedView' => 'text',
			'htmlText' => '',
			'contextText' => '',
			'htmlByteRows' => '',
			'contextByteRows' => '',
			'processedText' => '',
			'processedByteRows' => '',
			'normalizedText' => '',
			'normalizedByteRows' => '',
			'htmlTextHidden' => false,
			'htmlBytesHidden' => true,
			'contextTextHidden' => false,
			'contextBytesHidden' => true,
			'processedTextHidden' => false,
			'processedBytesHidden' => true,
			'normalizedTextHidden' => false,
			'normalizedBytesHidden' => true,
			'htmlConversionHidden' => true,
			'contextConversionHidden' => true,
			'normalizedUnavailable' => true,
			'urlError' => null,
			'transportError' => null,
			'previewError' => null,
			'urlUnusuallyLong' => false,
			'fragmentProjectionLossy' => false,
			'contextUnsupported' => ! $supports['create_fragment_advanced'],
			'processing' => false,
			'showClosers' => false,
			'showInvisible' => false,
			'showVirtual' => false,
			'selector' => '',
			'selectorErrorMessage' => null,
			'hoverInfo' => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion' => false,
			'htmlApiDocumentTitle' => null,
			'htmlApiDoctypeName' => null,
			'htmlApiDoctypePublicId' => null,
			'htmlApiDoctypeSystemId' => null,
			'treeWarnings' => array(),
			'playbackLength' => 0,
			'formattedRawResponse' => '',
			'checkingForPRPlaygroundLink' => false,
			'previewCoreLink' => null,
			'previewGutenbergLink' => null,
		)
	);

	ob_start();
	?>
<div
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch--main="callbacks.watch"
	data-wp-init="callbacks.run"
	class="html-api-debugger-container html-api-debugger--grid"
>
	<p class="full-width error-holder" data-wp-bind--hidden="!state.urlError" data-wp-text="state.urlError"></p>
	<p class="full-width error-holder" data-wp-bind--hidden="!state.transportError" data-wp-text="state.transportError"></p>
	<p class="full-width error-holder" data-wp-bind--hidden="!state.previewError" data-wp-text="state.previewError"></p>
	<p class="full-width warning-holder" data-wp-bind--hidden="!state.urlUnusuallyLong">This canonical URL is unusually long. Its bytes remain intact.</p>
	<p class="full-width warning-holder" data-wp-bind--hidden="!state.fragmentProjectionLossy">The fragment preview uses a lossy Unicode projection. Exact source and result bytes are unchanged.</p>

	<section class="full-width source-panel">
		<div class="heading-and-button">
			<h2>Fragment context</h2>
			<div class="view-buttons">
				<button type="button" data-wp-on--click="actions.showContextText">Text</button>
				<button type="button" data-wp-on--click="actions.showContextBytes">Bytes</button>
				<button type="button" data-wp-on-async--click="actions.handleDefaultBodyContextClick">Use HTML5 BODY context</button>
			</div>
		</div>
		<p class="warning-holder" data-wp-bind--hidden="!state.contextUnsupported">This WordPress version cannot parse fragments. Context bytes remain in the URL and byte inspector, while processing and preview use document mode.</p>
		<div data-wp-bind--hidden="state.contextTextHidden">
			<textarea
				id="context-html"
				class="context-html"
				placeholder="Provide a fragment context, for example:&#x0A;&lt;!DOCTYPE html&gt;&lt;body&gt;"
				title="Leave blank to parse a full document."
				rows="2"
				data-wp-bind--value="state.contextText"
				data-wp-on-async--input="actions.handleContextHtmlInput"
			></textarea>
		</div>
		<div data-wp-bind--hidden="state.contextBytesHidden">
			<pre class="byte-view" data-wp-text="state.contextByteRows"></pre>
			<p class="warning-holder" data-wp-bind--hidden="state.contextConversionHidden">Malformed UTF-8 is read-only. Editing converts invalid bytes to U+FFFD and changes the source.</p>
			<button type="button" data-wp-bind--hidden="state.contextConversionHidden" data-wp-on-async--click="actions.enableContextTextEditing">Convert and edit as UTF-8</button>
		</div>
	</section>

	<section class="source-panel">
		<div class="heading-and-button">
			<h2>Input HTML</h2>
			<div class="view-buttons">
				<button type="button" data-wp-on--click="actions.showHtmlText">Text</button>
				<button type="button" data-wp-on--click="actions.showHtmlBytes">Bytes</button>
			</div>
		</div>
		<div data-wp-bind--hidden="state.htmlTextHidden">
			<textarea
				id="input-html"
				autocapitalize="off"
				autocomplete="off"
				spellcheck="false"
				wrap="off"
				data-wp-bind--value="state.htmlText"
				data-wp-on-async--input="actions.handleInput"
			></textarea>
		</div>
		<div data-wp-bind--hidden="state.htmlBytesHidden">
			<pre class="byte-view" data-wp-text="state.htmlByteRows"></pre>
			<p class="warning-holder" data-wp-bind--hidden="state.htmlConversionHidden">Malformed UTF-8 is read-only. Editing converts invalid bytes to U+FFFD and changes the source.</p>
			<button type="button" data-wp-bind--hidden="state.htmlConversionHidden" data-wp-on-async--click="actions.enableHtmlTextEditing">Convert and edit as UTF-8</button>
		</div>
	</section>

	<div class="iframe-container">
		<h2>Rendered output</h2>
		<iframe
			src="about:blank"
			id="rendered_iframe"
			referrerpolicy="no-referrer"
			sandbox="allow-same-origin"></iframe>
	</div>

	<details class="full-width" data-wp-bind--hidden="state.normalizedUnavailable">
		<summary>HTML API Normalized HTML</summary>
		<div class="view-buttons">
			<button type="button" data-wp-on--click="actions.showNormalizedText">Text</button>
			<button type="button" data-wp-on--click="actions.showNormalizedBytes">Bytes</button>
		</div>
		<pre class="html-text" data-wp-bind--hidden="state.normalizedTextHidden" data-wp-text="state.normalizedText"></pre>
		<pre class="byte-view" data-wp-bind--hidden="state.normalizedBytesHidden" data-wp-text="state.normalizedByteRows"></pre>
	</details>

	<details class="full-width">
		<summary>Document info</summary>
		<div class="html-api-debugger--grid">
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.htmlapiResponse.result.compatMode"></code><br>
				Document title:&nbsp;<code data-wp-text="state.htmlApiDocumentTitle"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.htmlApiDoctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.htmlApiDoctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.htmlApiDoctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.htmlapiResponse.result.contextNode"></code>
			</div>
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code><br>
				Document title:&nbsp;<code data-wp-text="state.DOM.documentTitle"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.DOM.doctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.DOM.doctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.DOM.doctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.DOM.contextNode"></code>
			</div>
		</div>
	</details>

	<div class="full-width html-api-debugger--grid">
		<div>
			<div class="heading-and-button">
				<h2>Interpreted by HTML API</h2>
				<button type="button" data-wp-on-async--click="actions.handleCopyTreeClick" name="tree__html-api">Copy tree 📋</button>
			</div>
			<div data-wp-on-async--mouseover="actions.handleSpanOver" data-wp-on-async--mouseleave="actions.clearSpan">
				<pre class="error-holder" data-wp-bind--hidden="!state.htmlapiResponse.error" data-wp-text="state.htmlapiResponse.error"></pre>
				<div data-wp-bind--hidden="state.htmlapiResponse.error"><ul id="html_api_result_holder" data-wp-ignore></ul></div>
			</div>
		</div>
		<div>
			<div class="heading-and-button">
				<h2>Interpreted from DOM</h2>
				<button type="button" data-wp-on-async--click="actions.handleCopyTreeClick" name="tree__dom">Copy tree 📋</button>
			</div>
			<div data-wp-class--mutated="state.hasMutatedDom"><ul id="dom_tree" data-wp-ignore></ul></div>
		</div>
	</div>

	<div class="full-width">
		<div class="controls-row">
			<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" data-wp-on--input="actions.handleShowClosersClick"></label>
			<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" data-wp-on--input="actions.handleShowInvisibleClick"></label>
			<label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" data-wp-on--input="actions.handleShowVirtualClick"></label>
			<span data-wp-bind--hidden="!state.htmlapiResponse.supports.selectors">
				<label>CSS Selectors <textarea id="selector-input" placeholder="CSS selector: .my-class" data-wp-bind--value="state.selector" data-wp-on-async--input="actions.handleSelectorChange"></textarea></label>
			</span>
			<label>Hover information
				<select data-wp-on--change="actions.hoverInfoChange">
					<option data-wp-bind--selected="state.hoverBreadcrumbs" value="breadcrumbs">(depth) Breadcrumbs…</option>
					<option data-wp-bind--selected="state.hoverInsertion" value="insertionMode">Insertion mode</option>
				</select>
			</label>
		</div>

		<div data-wp-bind--hidden="!state.treeWarnings.length">
			<template data-wp-each="state.treeWarnings"><p data-wp-text="context.item" class="error-holder"></p></template>
		</div>
		<p data-wp-bind--hidden="!state.selectorErrorMessage" data-wp-text="state.selectorErrorMessage" class="error-holder"></p>

		<div>
			<div class="heading-and-button">
				<h2>Processed HTML</h2>
				<div class="view-buttons">
					<button type="button" data-wp-on--click="actions.showProcessedText">Text</button>
					<button type="button" data-wp-on--click="actions.showProcessedBytes">Bytes</button>
				</div>
			</div>
			<div data-wp-bind--hidden="!state.playbackLength">
				<label>Move the slider to replay token processing:
					<input type="range" min="2" style="width:100%" data-wp-bind--max="state.playbackLength" data-wp-bind--value="state.playbackLength" data-wp-on--input="actions.handlePlaybackChange">
				</label>
			</div>
			<pre class="html-text" id="processed-html" data-wp-bind--hidden="state.processedTextHidden" data-wp-ignore></pre>
			<pre class="byte-view" data-wp-bind--hidden="state.processedBytesHidden" data-wp-text="state.processedByteRows"></pre>
		</div>

		<p>
			<label><select id="htmlapi-wp-version">
				<option value="latest">latest</option><option value="nightly">nightly</option><option value="beta">beta</option><option value="6.7">6.7</option>
			</select></label>
			<button data-wp-on-async--click="actions.handleCopyClick" type="button">Copy shareable playground link</button>
		</p>
		<p>
			<label><code>WordPress/develop</code> PR number: <input type="number" min="1" data-wp-on-async--input="actions.handleCopyCorePrInput"></label>
			<label><code>WordPress/gutenberg</code> PR number: <input type="number" min="1" data-wp-on-async--input="actions.handleCopyGutenbergPrInput"></label>
			<button data-wp-on-async--click="actions.handleCopyPrClick">Copy shareable playground link to PR</button>
			<span data-wp-bind--hidden="!state.previewCoreLink"><a data-wp-bind--href="state.previewCoreLink.href" data-wp-text="state.previewCoreLink.text" rel="noopener noreferrer"></a></span>
			<span data-wp-bind--hidden="!state.previewGutenbergLink"><a data-wp-bind--href="state.previewGutenbergLink.href" data-wp-text="state.previewGutenbergLink.text" rel="noopener noreferrer"></a></span>
		</p>
		<details><summary>Exact REST response envelopes</summary><pre data-wp-text="state.formattedRawResponse"></pre></details>
	</div>
</div>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}
