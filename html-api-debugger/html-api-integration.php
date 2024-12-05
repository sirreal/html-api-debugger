<?php
namespace HTML_API_Debugger\HTML_API_Integration;

use Exception;
use ReflectionMethod;
use ReflectionProperty;
use WP_HTML_Processor;

/**
 * Get information about HTML API supported features
 */
function get_supports(): array {
	return array(
		'create_fragment_advanced' => method_exists( WP_HTML_Processor::class, 'create_fragment_at_current_node' ),
	);
}

/**
 * Get the normalized HTML.
 *
 * @param string $html The HTML.
 * @param array  $options The options.
 * @return string|null The normalized HTML or null if not supported.
 */
function get_normalized_html( string $html, array $options ): ?string {
	$cfacn = new ReflectionMethod( WP_HTML_Processor::class, 'create_fragment_at_current_node' );
	$cfacn->setAccessible( true );

	if (
		method_exists( WP_HTML_Processor::class, 'create_fragment_at_current_node' ) &&
		$options['context_html']
	) {
		$context_processor = WP_HTML_Processor::create_full_parser( $options['context_html'] );

		while ( $context_processor->next_tag() ) {
			$context_processor->set_bookmark( 'final_node' );
		}
		if ( $context_processor->has_bookmark( 'final_node' ) ) {
			$context_processor->seek( 'final_node' );
			/**
			 * The main processor used for tree building.
			 *
			 * @var WP_HTML_Processor|null $processor
			 * @disregard P1013
			 */
			$processor = $cfacn->invoke( $context_processor, $html );
		}
	} else {
		$processor = WP_HTML_Processor::create_full_parser( $html );
	}

	if ( ! isset( $processor ) ) {
		return null;
	}

	// Ignore warnings from serialization.
	// phpcs:ignore WordPress.PHP.DevelopmentFunctions
	set_error_handler( function () { }, E_USER_WARNING );
	$result = $processor->serialize();
	restore_error_handler();
	return $result;
}

/**
 * Build a DOM-like tree using the HTML API
 *
 * @throws Exception Throws when stuff breaks :D
 *
 * @param string $html    The HTML.
 * @param array  $options The options.
 */
function get_tree( string $html, array $options ): array {
	/**
	 * Messages generated during parse.
	 *
	 * @var string[]
	 */
	$warnings = array();
	$selector = null;
	if ( isset( $options['selector'] ) && class_exists( '\WP_CSS_Complex_Selector_List' ) ) {
		$selector = \WP_CSS_Complex_Selector_List::from_selectors( $options['selector'] );
		if ( null === $selector ) {
			$warnings[] = 'The provided selector is invalid or unsupported.';
		}
	} elseif ( isset( $options['selector'] ) && class_exists( '\WP_CSS_Compound_Selector_List' ) ) {
		$selector = \WP_CSS_Compound_Selector_List::from_selectors( $options['selector'] );
		if ( null === $selector ) {
			$warnings[] = 'The provided selector is invalid or unsupported.';
		}
	}

	$processor_state = new ReflectionProperty( WP_HTML_Processor::class, 'state' );
	$processor_state->setAccessible( true );

	$processor_bookmarks = new ReflectionProperty( WP_HTML_Processor::class, 'bookmarks' );
	$processor_bookmarks->setAccessible( true );

	$cfacn = new ReflectionMethod( WP_HTML_Processor::class, 'create_fragment_at_current_node' );
	$cfacn->setAccessible( true );

	$is_fragment_processor = false;

	$compat_mode               = 'BackCompat';
	$document_title            = null;
	$doctype_name              = null;
	$doctype_public_identifier = null;
	$doctype_system_identifier = null;

	if (
		method_exists( WP_HTML_Processor::class, 'create_fragment_at_current_node' ) &&
		$options['context_html']
	) {
		$context_processor = WP_HTML_Processor::create_full_parser( $options['context_html'] );

		while ( $context_processor->next_token() ) {
			switch ( $context_processor->get_token_type() ) {
				case '#doctype':
					$doctype                   = $context_processor->get_doctype_info();
					$doctype_name              = $doctype->name;
					$doctype_public_identifier = $doctype->public_identifier;
					$doctype_system_identifier = $doctype->system_identifier;
					if ( $doctype->indicated_compatability_mode !== 'quirks' ) {
						$compat_mode = 'CSS1Compat';
					}
					break;

				case '#tag':
					if ( $document_title === null && $context_processor->get_tag() === 'TITLE' && $context_processor->get_namespace() === 'html' ) {
						$document_title = $context_processor->get_modifiable_text();
					}

					$context_processor->set_bookmark( 'final_node' );
					break;
			}
		}

		if ( $document_title === null ) {
			$document_title = '';
		}

		if ( $context_processor->has_bookmark( 'final_node' ) ) {
			$context_processor->seek( 'final_node' );
			/**
			 * The main processor used for tree building.
			 *
			 * @var WP_HTML_Processor|null $processor
			 * @disregard P1013
			 */
			$processor = $cfacn->invoke( $context_processor, $html );
		}

		if ( ! isset( $processor ) ) {
			throw new Exception( 'Could not create processor from context HTML.' );
		}

		$is_fragment_processor = true;
	} else {
		$processor = WP_HTML_Processor::create_full_parser( $html );
	}

	if ( null === $processor ) {
		throw new Exception( 'Could not create processor.' );
	}

	$processor_is_virtual = new ReflectionMethod( WP_HTML_Processor::class, 'is_virtual' );
	$processor_is_virtual->setAccessible( true );
	$is_virtual = function () use ( $processor_is_virtual, $processor ) {
		return $processor_is_virtual->invoke( $processor );
	};

	$tree = array(
		'nodeType' => NODE_TYPE_DOCUMENT,
		'nodeName' => '#document',
		'childNodes' => array(),
	);

	$cursor = array( 0 );

	if ( $is_fragment_processor ) {
		$tree   = array(
			'childNodes' => array(),
		);
		$cursor = array();
	}

	$context_node = isset( $context_processor )
		? $context_processor->get_qualified_tag_name()
		: null;

	$playback = array();

	$last_html = '';
	while ( $processor->next_token() ) {
		$playback[] = array( $last_html, $tree );
		/**
		 * The bookmark of the current token.
		 *
		 * @var \WP_HTML_Span
		 */
		$bookmark  = $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ];
		$last_html = substr( $html, 0, $bookmark->start + $bookmark->length );

		if ( $processor->get_last_error() !== null ) {
			break;
		}

		// Depth needs and adjustment because:
		// - Nodes in a full tree are all placed under a document node.
		// - Nodes in a fragment tree start at the root.
		if ( ( count( $cursor ) + 1 ) > ( $processor->get_current_depth() - ( $is_fragment_processor ? 1 : 0 ) ) ) {
			array_pop( $cursor );
		}
		$current = &$tree;
		foreach ( $cursor as $path ) {
			$current = &$current['childNodes'][ $path ];
		}

		$token_type = $processor->get_token_type();

		switch ( $token_type ) {
			case '#doctype':
				$doctype                   = $processor->get_doctype_info();
				$doctype_name              = $doctype->name;
				$doctype_public_identifier = $doctype->public_identifier;
				$doctype_system_identifier = $doctype->system_identifier;
				if ( $doctype->indicated_compatability_mode !== 'quirks' ) {
					$compat_mode = 'CSS1Compat';
				}

				$current['childNodes'][] = array(
					'nodeType' => NODE_TYPE_DOCUMENT_TYPE,
					'nodeName' => $doctype_name,
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_depth' => $processor->get_current_depth(),
				);
				break;

			case '#tag':
				$tag_name = $processor->get_qualified_tag_name();

				if ( $document_title === null && $tag_name === 'TITLE' && $processor->get_namespace() === 'html' ) {
					$document_title = $processor->get_modifiable_text();
				}

				$matches = $selector !== null && $selector->matches( $processor );

				$attributes      = array();
				$attribute_names = $processor->get_attribute_names_with_prefix( '' );
				if ( null !== $attribute_names ) {
					foreach ( $attribute_names as $attribute_name ) {
						$val = $processor->get_attribute( $attribute_name );

						/*
						 * Attributes with no value are `true` with the HTML API,
						 * We map use the empty string value in the tree structure.
						 */
						if ( true === $val ) {
							$val = '';
						}
						$attributes[] = array(
							'nodeType' => NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName' => $processor->get_qualified_attribute_name( $attribute_name ),
							'nodeValue' => $val,
						);
					}
				}

				$namespace = $processor->get_namespace();

				$self = array(
					'nodeType' => NODE_TYPE_ELEMENT,
					'nodeName' => $tag_name,
					'attributes' => $attributes,
					'childNodes' => array(),
					'_closer' => (bool) $processor->is_tag_closer(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
					'_namespace' => $namespace,
					'_matches' => $matches,
				);

				// Self-contained tags contain their inner contents as modifiable text.
				$modifiable_text = $processor->get_modifiable_text();
				if ( '' !== $modifiable_text ) {
					$self['childNodes'][] = array(
						'nodeType' => NODE_TYPE_TEXT,
						'nodeName' => '#text',
						'nodeValue' => $modifiable_text,
						'_span' => null,
						'_mode' => $processor_state->getValue( $processor )->insertion_mode,
						'_bc' => array_merge( $processor->get_breadcrumbs(), array( '#text' ) ),
						'_virtual' => $is_virtual(),
						'_depth' => $processor->get_current_depth() + 1,
					);
				}

				$current['childNodes'][] = $self;

				if (
					$processor->is_tag_closer() ||
					( $namespace === 'html' && WP_HTML_Processor::is_void( $tag_name ) ) ||
					( $namespace !== 'html' && $processor->has_self_closing_flag() )
				) {
					break;
				}

				$cursor[] = count( $current['childNodes'] ) - 1;
				break;

			case '#text':
				$self = array(
					'nodeType' => NODE_TYPE_TEXT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#cdata-section':
				$self = array(
					'nodeType' => NODE_TYPE_CDATA_SECTION,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#presumptuous-tag':
				$self                    = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#funky-comment':
				$self                    = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#comment':
				$self = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $processor->get_current_depth(),
				);
				switch ( $processor->get_comment_type() ) {
					case WP_HTML_Processor::COMMENT_AS_ABRUPTLY_CLOSED_COMMENT:
					case WP_HTML_Processor::COMMENT_AS_HTML_COMMENT:
						$self['nodeName']  = $processor->get_token_name();
						$self['nodeValue'] = $processor->get_modifiable_text();
						break;

					case WP_HTML_Processor::COMMENT_AS_PI_NODE_LOOKALIKE:
						$self['nodeName']   = "{$processor->get_token_name()}({$processor->get_comment_type()})";
						$self['childNodes'] = array(
							array(
								'nodeType'  => NODE_TYPE_PROCESSING_INSTRUCTION,
								'nodeName' => $processor->get_tag(),
								'nodeValue' => $processor->get_modifiable_text(),
							),
						);
						break;

					case WP_HTML_Processor::COMMENT_AS_CDATA_LOOKALIKE:
						$self['nodeName']  = "{$processor->get_token_name()}({$processor->get_comment_type()})";
						$self['nodeValue'] = $processor->get_modifiable_text();
						break;

					case WP_HTML_Processor::COMMENT_AS_INVALID_HTML:
						$self['nodeName']  = "{$processor->get_token_name()}({$processor->get_comment_type()})";
						$self['nodeValue'] = $processor->get_modifiable_text();
						break;

					default:
						// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
						throw new Exception( "Unhandled comment type for tree construction: {$processor->get_comment_type()}" );
				}

				$current['childNodes'][] = $self;
				break;

			default:
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_var_export
				$serialized_token_type = var_export( $token_type, true );
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
		}
	}
	$playback[] = array( $last_html, $tree );

	if ( null !== $processor->get_last_error() ) {
		if ( $processor->get_unsupported_exception() ) {
			throw $processor->get_unsupported_exception();
		} elseif ( $processor->get_last_error() ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
			throw new Exception( $processor->get_last_error() );
		} else {
			throw new Exception( 'Unknown error.' );
		}
	}

	// This could perhaps be ignored or surfaced in the response.
	if ( $processor->paused_at_incomplete_token() ) {
		throw new Exception( 'Paused at incomplete token.' );
	}

	/*
	 * Strip and collapse ASCII whitespace.
	 *
	 * https://html.spec.whatwg.org/multipage/dom.html#document.title
	 * https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
	 */
	if ( null !== $document_title ) {
		$document_title = trim( preg_replace( "/[\t\n\f\r ]+/", ' ', $document_title ), "\t\n\f\r " );
	}

	return array(
		'tree' => $tree,
		'playback' => $playback,
		'compatMode' => $compat_mode,
		'documentTitle' => $document_title,

		'doctypeName' => $doctype_name,
		'doctypePublicId' => $doctype_public_identifier,
		'doctypeSystemId' => $doctype_system_identifier,

		'contextNode' => $context_node,
		'warnings' => $warnings,
	);
}

const NODE_TYPE_ELEMENT                = 1;
const NODE_TYPE_ATTRIBUTE              = 2;
const NODE_TYPE_TEXT                   = 3;
const NODE_TYPE_CDATA_SECTION          = 4;
const NODE_TYPE_ENTITY_REFERENCE       = 5;
const NODE_TYPE_ENTITY                 = 6;
const NODE_TYPE_PROCESSING_INSTRUCTION = 7;
const NODE_TYPE_COMMENT                = 8;
const NODE_TYPE_DOCUMENT               = 9;
const NODE_TYPE_DOCUMENT_TYPE          = 10;
const NODE_TYPE_DOCUMENT_FRAGMENT      = 11;
const NODE_TYPE_NOTATION               = 12;
