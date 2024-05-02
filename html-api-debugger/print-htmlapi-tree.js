export function printHtmlApiTree( node, ul ) {
	while ( ul.firstChild ) {
		ul.removeChild( ul.firstChild );
	}

	for ( var i = 0; i < node.childNodes.length; i += 1 ) {
		const li = document.createElement( 'li' );
		li.className = 't' + node.childNodes[ i ].nodeType;
		if ( node.childNodes[ i ].nodeType === 10 ) {
			li.appendChild( document.createTextNode( 'DOCTYPE: ' ) );
		}
		if ( node.childNodes[ i ].nodeName ) {
			const code = document.createElement( 'code' );
			code.appendChild(
				document.createTextNode( node.childNodes[ i ].nodeName )
			);

			if ( node.childNodes[ i ].nodeValue ) {
				code.className = 'hasNodeValue';
			}
			li.appendChild( code );
		} else {
			const span = document.createElement( 'span' );
			span.appendChild( document.createTextNode( 'no name' ) );
			span.className = 'unnamed';
			li.appendChild( span );
		}
		if ( node.childNodes[ i ].nodeValue ) {
			const el = document.createElement( 'pre' );
			el.className = 'nodeValue';
			el.appendChild(
				document.createTextNode( node.childNodes[ i ].nodeValue )
			);
			li.appendChild( el );
		}
		if ( node.childNodes[ i ].attributes ) {
			for (
				var j = 0;
				j < node.childNodes[ i ].attributes.length;
				j += 1
			) {
				if ( node.childNodes[ i ].attributes[ j ].specified ) {
					const attName = document.createElement( 'code' );
					attName.appendChild(
						document.createTextNode(
							node.childNodes[ i ].attributes[ j ].nodeName
						)
					);
					attName.className = 'attribute name';
					const attValue = document.createElement( 'code' );
					attValue.appendChild(
						document.createTextNode(
							node.childNodes[ i ].attributes[ j ].nodeValue
						)
					);
					attValue.className = 'attribute value';
					const att = document.createElement( 'span' );
					att.className = 't2';
					att.appendChild( attName );
					att.appendChild( document.createTextNode( '="' ) );
					att.appendChild( attValue );
					att.appendChild( document.createTextNode( '"' ) );
					li.appendChild( document.createTextNode( ' ' ) );
					li.appendChild( att );
				}
			}
		}

		if ( node.childNodes[ i ].childNodes?.length ) {
			const ul2 = document.createElement( 'ul' );
			li.appendChild( ul2 );
			printHtmlApiTree( node.childNodes[ i ], ul2 );
		}
		if ( node.childNodes[ i ].content ) {
			const ul2 = document.createElement( 'ul' );
			li.appendChild( ul2 );
			ul2.className = 'template';
			printHtmlApiTree( node.childNodes[ i ].content, ul2 );
		}

		ul.appendChild( li );
	}
}
