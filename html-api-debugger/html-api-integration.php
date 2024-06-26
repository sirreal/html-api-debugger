<?php

namespace HTML_API_Debugger\HTML_API_Integration;

use Exception;
use ReflectionClass;
use ReflectionMethod;
use ReflectionProperty;
use WP_HTML_Processor;

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

/**
 * Build the HTML API tree.
 *
 * @param string $html The HTML.
 */
function build_html_tree( string $html ): array {
	$tree   = namespace\get_tree( $html );
	$tokens = namespace\get_tokens( $html );
	$tags   = namespace\get_tags( $html );

	$rc       = new ReflectionClass( WP_HTML_Processor::class );
	$supports = array(
		'is_virtual' => $rc->hasMethod( 'is_virtual' ),
	);

	return array(
		'tree'     => $tree,
		'tokens'   => $tokens,
		'tags'     => $tags,
		'supports' => $supports,
	);
}

function get_tags( string $html ): array {
	$processor = WP_HTML_Processor::create_fragment( $html );

	if ( null === $processor ) {
		throw new Exception( 'could not process html' );
	}

	$tags = array();

	while ( $processor->next_tag( array( 'visit_closers' => true ) ) ) {
		if ( $processor->get_last_error() !== null ) {
			break;
		}

		$tags[] = array(
			'name'   => $processor->get_tag(),
			'closer' => $processor->is_tag_closer(),
		);
	}

	return $tags;
}

function get_tokens( string $html ): array {
	$processor = WP_HTML_Processor::create_fragment( $html );

	if ( null === $processor ) {
		throw new Exception( 'could not process html' );
	}

	$tokens = array();

	while ( $processor->next_token() ) {
		if ( $processor->get_last_error() !== null ) {
			break;
		}

		switch ( $processor->get_token_type() ) {
			case '#tag':
				$tokens[] = array(
					'type'   => $processor->get_token_type(),
					'name'   => $processor->get_tag(),
					'closer' => $processor->is_tag_closer(),
				);
				break;

			case '#text':
				$tokens[] = array(
					'type'    => $processor->get_token_type(),
					'content' => $processor->get_modifiable_text(),
				);
				break;

			case '#presumptuous-tag':
				$tokens[] = array(
					'type'         => $processor->get_token_type(),
					'content'      => $processor->get_modifiable_text(),
					'comment_type' => $processor->get_comment_type(),
				);
				break;

			case '#funky-comment':
				$tokens[] = array(
					'type'         => $processor->get_token_type(),
					'content'      => $processor->get_modifiable_text(),
					'comment_type' => $processor->get_comment_type(),
				);
				break;

			case '#comment':
				$tokens[] = array(
					'type'         => $processor->get_token_type(),
					'content'      => $processor->get_modifiable_text(),
					'comment_type' => $processor->get_comment_type(),
				);
				break;

			default:
				$serialized_token_type = var_export( $processor->get_token_type(), true );
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
		}
	}

	return $tokens;
}

function get_tree( string $html ): array {
	$processor_state = new ReflectionProperty( WP_HTML_Processor::class, 'state' );
	$processor_state->setAccessible( true );

	$processor_bookmarks = new ReflectionProperty( WP_HTML_Processor::class, 'bookmarks' );
	$processor_bookmarks->setAccessible( true );

	$processor = WP_HTML_Processor::create_fragment( $html );

	$rc = new ReflectionClass( WP_HTML_Processor::class );

	$is_virtual = function () {
		return null;
	};

	if ( $rc->hasMethod( 'is_virtual' ) ) {
		$processor_is_virtual = new ReflectionMethod( WP_HTML_Processor::class, 'is_virtual' );
		$processor_is_virtual->setAccessible( true );
		$is_virtual = function () use ( $processor_is_virtual, $processor ) {
			return $processor_is_virtual->invoke( $processor );
		};
	}

	$get_current_depth = method_exists( WP_HTML_Processor::class, 'get_current_depth' )
		? function () use ( $processor ) {
			return $processor->get_current_depth();
		}
		: function () use ( $processor ) {
			return count( $processor->get_breadcrumbs() );
		};

	if ( null === $processor ) {
		throw new Exception( 'could not process html' );
	}

	$tree = array(
		'nodeType'   => NODE_TYPE_DOCUMENT,
		'nodeName'   => '#document',
		'childNodes' => array(
			array(
				'nodeType'  => NODE_TYPE_DOCUMENT_TYPE,
				'nodeName'  => 'html',
				'nodeValue' => '',
			),
			array(
				'nodeType'   => NODE_TYPE_ELEMENT,
				'nodeName'   => 'HTML',
				'attributes' => array(),
				'childNodes' => array(
					array(
						'nodeType'   => NODE_TYPE_ELEMENT,
						'nodeName'   => 'HEAD',
						'attributes' => array(),
						'childNodes' => array(),
					),
					array(
						'nodeType'   => NODE_TYPE_ELEMENT,
						'nodeName'   => 'BODY',
						'attributes' => array(),
						'childNodes' => array(),
					),
				),
			),
		),
	);

	$cursor = array( 1, 1 );

	while ( $processor->next_token() ) {
		if ( $processor->get_last_error() !== null ) {
			break;
		}

		if ( ( count( $cursor ) + 1 ) > $get_current_depth() ) {
			array_pop( $cursor );
		}
		$current = &$tree;
		foreach ( $cursor as $path ) {
			$current = &$current['childNodes'][ $path ];
		}

		switch ( $processor->get_token_type() ) {
			case '#tag':
				$tag_name = $processor->get_tag();

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
							'nodeType'  => NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName'  => $attribute_name,
							'nodeValue' => $val,
						);
					}
				}

				$self = array(
					'nodeType'   => NODE_TYPE_ELEMENT,
					'nodeName'   => $tag_name,
					'attributes' => $attributes,
					'childNodes' => array(),
					'_closer'    => (bool) $processor->is_tag_closer(),
					'_span'      => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_bc'        => $processor->get_breadcrumbs(),
					'_virtual'   => $is_virtual(),
					'_depth'     => $get_current_depth(),
				);

				$current['childNodes'][] = $self;

				if ( $processor->is_tag_closer() ) {
					break;
				}

				if ( ! WP_HTML_Processor::is_void( $tag_name ) ) {
					$cursor[] = count( $current['childNodes'] ) - 1;
				}

				break;

			case '#text':
				$self = array(
					'nodeType'  => NODE_TYPE_TEXT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#presumptuous-tag':
				$self                    = array(
					'nodeType'  => NODE_TYPE_COMMENT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#funky-comment':
				$self                    = array(
					'nodeType'  => NODE_TYPE_COMMENT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#comment':
				$self = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'_span'    => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_bc'      => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth'   => $get_current_depth(),
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
								'nodeName'  => $processor->get_tag(),
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
				$serialized_token_type = var_export( $processor->get_token_type(), true );
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
		}
	}

	if ( null !== $processor->get_last_error() ) {
		// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
		throw new Exception( $processor->get_last_error() );
	}

	if ( $processor->paused_at_incomplete_token() ) {
		throw new Exception( 'Paused at incomplete token' );
	}

	return $tree;
}
