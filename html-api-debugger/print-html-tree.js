import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';

/**
 * @typedef Options
 * @property {boolean} [showClosers]
 * @property {boolean} [showInvisible]
 * @property {boolean} [showVirtual]
 * @property {string|null} [selector]
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
		li.className = `t${node.childNodes[i].nodeType}`;

		if (options.selector && node.childNodes[i].matches?.(options.selector)) {
			li.classList.add('matches-selector');
		}

		if (node.childNodes[i].nodeType === Node.prototype.DOCUMENT_TYPE_NODE) {
			li.appendChild(document.createTextNode('DOCTYPE: '));
		}
		if (node.childNodes[i].nodeName) {
			const code = document.createElement('code');

			let nodeText = options.showInvisible
				? replaceInvisible(node.childNodes[i].nodeName)
				: node.childNodes[i].nodeName;
			if (
				node.childNodes[i]._namespace &&
				node.childNodes[i]._namespace !== 'html'
			) {
				nodeText = `${node.childNodes[i]._namespace}:${nodeText}`;
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
				nodeText = `${ns}:${nodeText}`;
			}

			if (node.childNodes[i]._closer) {
				if (options.showClosers) {
					code.appendChild(document.createTextNode(`/${nodeText}`));
				} else {
					continue;
				}
			} else {
				code.appendChild(document.createTextNode(nodeText));
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
			li.dataset['breadcrumbs'] = (
				options.showInvisible
					? node.childNodes[i]._bc.map(replaceInvisible)
					: node.childNodes[i]._bc
			).join(' > ');
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
						document.createTextNode(
							options.showInvisible
								? replaceInvisible(node.childNodes[i].attributes[j].nodeName)
								: node.childNodes[i].attributes[j].nodeName,
						),
					);
					attName.className = 'attribute name';
					const attValue = document.createElement('code');
					attValue.appendChild(
						document.createTextNode(
							options.showInvisible
								? replaceInvisible(node.childNodes[i].attributes[j].nodeValue)
								: node.childNodes[i].attributes[j].nodeValue,
						),
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

		if (
			node.childNodes[i].childNodes?.length ||
			(node.childNodes[i].nodeName === 'TEMPLATE' && node.childNodes[i].content)
		) {
			const next = node.childNodes[i].childNodes?.length
				? node.childNodes[i]
				: node.childNodes[i].content;

			const ul2 = document.createElement('ul');
			if (node.childNodes[i].nodeName === 'TEMPLATE') {
				ul2.className = 'template';
			}

			li.appendChild(ul2);
			printHtmlApiTree(next, ul2, options);
		}

		ul.appendChild(li);
	}
}

const LAST_CHILD = '└';
const MIDDLE_CHILD = '├';
const DESCENDER = '│';
const HORIZONTAL = '─';

/**
 * @param {any} tree
 * @param {Options} options
 * @returns {string}
 */
export function printHtmlApiTreeText(tree, options = {}) {
	let text = '';
	/**
	 * @param {any} node
	 * @param {string} prepend
	 */
	const go = (node, prepend) => {
		// No support for closers at this time.
		const childNodes = Array.prototype.filter.call(
			node.childNodes,
			/** @param {any} n */
			(n) => !n._closer,
		);

		for (let i = 0; i < childNodes.length; i += 1) {
			const isLastChild = i === childNodes.length - 1;

			let line = `${isLastChild ? LAST_CHILD : MIDDLE_CHILD}${HORIZONTAL}`;

			if (childNodes[i].nodeType === Node.prototype.DOCUMENT_TYPE_NODE) {
				line += 'DOCTYPE: ';
			}
			if (childNodes[i].nodeName) {
				let nodeText = options.showInvisible
					? replaceInvisible(childNodes[i].nodeName)
					: childNodes[i].nodeName;
				if (childNodes[i]._namespace && childNodes[i]._namespace !== 'html') {
					nodeText = `${childNodes[i]._namespace}:${nodeText}`;
				} else if (
					childNodes[i].namespaceURI &&
					childNodes[i].namespaceURI !== 'http://www.w3.org/1999/xhtml'
				) {
					const nsSuffix = childNodes[i].namespaceURI.split('/').at(-1);
					const ns =
						nsSuffix === 'svg'
							? 'svg'
							: nsSuffix === 'MathML'
								? 'math'
								: nsSuffix;
					nodeText = `${ns}:${nodeText}`;
				}

				line += nodeText;
			} else {
				line += 'no name';
			}

			if (childNodes[i].nodeValue) {
				line += ` ${
					options.showInvisible
						? replaceInvisible(childNodes[i].nodeValue)
						: childNodes[i].nodeValue
				}`;
			}

			if (childNodes[i].attributes) {
				for (let j = 0; j < childNodes[i].attributes.length; j += 1) {
					if (childNodes[i].attributes[j].specified) {
						const attName = options.showInvisible
							? replaceInvisible(childNodes[i].attributes[j].nodeName)
							: childNodes[i].attributes[j].nodeName;
						const attValue = options.showInvisible
							? replaceInvisible(childNodes[i].attributes[j].nodeValue)
							: childNodes[i].attributes[j].nodeValue;
						line += ` ${attName}="${attValue}"`;
					}
				}
			}

			text += `${prepend}${line.replaceAll('\n', ' ')}\n`;

			if (
				childNodes[i].childNodes?.length ||
				(childNodes[i].nodeName === 'TEMPLATE' && childNodes[i].content)
			) {
				const next = childNodes[i].childNodes?.length
					? childNodes[i]
					: childNodes[i].content;

				go(next, `${prepend}${isLastChild ? ' ' : DESCENDER} `);
			}
		}
	};

	go(tree, '');

	return text;
}
