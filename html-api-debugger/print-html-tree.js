import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';

/**
 * @typedef Options
 * @property {boolean} [showClosers]
 * @property {boolean} [showInvisible]
 * @property {boolean} [showVirtual]
 * @property {'breadcrumbs'|'insertionMode'} [hoverInfo]
 */

/**
 * @param {any} node
 * @param {HTMLUListElement} ul
 * @param {Options} options
 */
export function printHtmlApiTree(node, ul, options = {}) {
	while (ul.firstChild) {
		ul.removeChild(ul.firstChild);
	}

	for (let i = 0; i < node.childNodes.length; i += 1) {
		const li = document.createElement('li');
		li.className = 't' + node.childNodes[i].nodeType;
		if (node.childNodes[i].nodeType === Node.prototype.DOCUMENT_TYPE_NODE) {
			li.appendChild(document.createTextNode('DOCTYPE: '));
		}
		if (node.childNodes[i].nodeName) {
			const code = document.createElement('code');

			if (node.childNodes[i]._closer) {
				if (options.showClosers) {
					code.appendChild(
						document.createTextNode('/' + node.childNodes[i].nodeName),
					);
				} else {
					continue;
				}
			} else {
				if (
					node.childNodes[i]._namespace &&
					node.childNodes[i]._namespace !== 'html'
				) {
					code.appendChild(
						document.createTextNode(
							`${node.childNodes[i]._namespace}:${node.childNodes[i].nodeName}`,
						),
					);
				} else if (
					node.childNodes[i].namespaceURI &&
					node.childNodes[i].namespaceURI !== 'http://www.w3.org/1999/xhtml'
				) {
					const nsSuffix = node.childNodes[i].namespaceURI.split('/').at(-1);
					const ns =
						nsSuffix === 'svg'
							? 'svg'
							: nsSuffix === 'MathML'
								? 'math'
								: nsSuffix;
					code.appendChild(
						document.createTextNode(`${ns}:${node.childNodes[i].nodeName}`),
					);
				} else {
					code.appendChild(
						document.createTextNode(node.childNodes[i].nodeName),
					);
				}
			}

			if (node.childNodes[i].nodeValue) {
				code.className = 'hasNodeValue';
			}
			li.appendChild(code);
		} else {
			const span = document.createElement('span');
			span.appendChild(document.createTextNode('no name'));
			span.className = 'unnamed';
			li.appendChild(span);
		}
		if (node.childNodes[i].nodeValue) {
			const el = document.createElement('pre');
			el.className = 'nodeValue';
			el.appendChild(
				document.createTextNode(
					options.showInvisible
						? replaceInvisible(node.childNodes[i].nodeValue)
						: node.childNodes[i].nodeValue,
				),
			);
			li.appendChild(el);
		}

		if (node.childNodes[i]._span) {
			li.dataset['spanStart'] = node.childNodes[i]._span.start;
			li.dataset['spanLength'] = node.childNodes[i]._span.length;
		}
		if (node.childNodes[i]._mode) {
			li.dataset['mode'] = node.childNodes[i]._mode;
			if (options.hoverInfo === 'insertionMode') {
				li.title = /** @type {string} */ (li.dataset['mode']);
			}
		}
		if (node.childNodes[i]._depth) {
			li.dataset['depth'] = node.childNodes[i]._depth;
		}
		if (node.childNodes[i]._bc?.length) {
			li.dataset['breadcrumbs'] = node.childNodes[i]._bc.join(' > ');
			if (options.hoverInfo === 'breadcrumbs') {
				li.title = /** @type {string} */ (li.dataset['breadcrumbs']);
				if (li.dataset['depth']) {
					li.title = `(${li.dataset['depth']}) ${li.title}`;
				}
			}
		}

		if (
			options.showVirtual &&
			typeof node.childNodes[i]._virtual === 'boolean'
		) {
			li.classList.add(node.childNodes[i]._virtual ? 'is-virtual' : 'is-real');
		}
		if (node.childNodes[i]._closer) {
			li.classList.add('tag-closer');
		}
		if (node.childNodes[i].attributes) {
			for (let j = 0; j < node.childNodes[i].attributes.length; j += 1) {
				if (node.childNodes[i].attributes[j].specified) {
					const attName = document.createElement('code');
					attName.appendChild(
						document.createTextNode(node.childNodes[i].attributes[j].nodeName),
					);
					attName.className = 'attribute name';
					const attValue = document.createElement('code');
					attValue.appendChild(
						document.createTextNode(node.childNodes[i].attributes[j].nodeValue),
					);
					attValue.className = 'attribute value';
					const att = document.createElement('span');
					att.className = 't2';
					att.appendChild(attName);
					att.appendChild(document.createTextNode('="'));
					att.appendChild(attValue);
					att.appendChild(document.createTextNode('"'));
					li.appendChild(document.createTextNode(' '));
					li.appendChild(att);
				}
			}
		}

		if (node.childNodes[i].childNodes?.length) {
			const ul2 = document.createElement('ul');
			li.appendChild(ul2);
			printHtmlApiTree(node.childNodes[i], ul2, options);
		}

		if (node.childNodes[i].content) {
			const ul2 = document.createElement('ul');
			li.appendChild(ul2);
			ul2.className = 'template';
			printHtmlApiTree(node.childNodes[i].content, ul2, options);
		}

		ul.appendChild(li);
	}
}
