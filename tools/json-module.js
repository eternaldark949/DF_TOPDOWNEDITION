/**
 * Build-time JSON embedding. Emit a string parsed as data, rather than a JavaScript
 * object literal: a literal treats __proto__ specially and can change JSON semantics.
 * Escaping every '<' prevents HTML script termination while preserving parsed text.
 * Callers validate the document and its byte budget before requesting this expression.
 */
export function embedJSON(data){
 return `JSON.parse(${JSON.stringify(JSON.stringify(data)).replace(/</g,'\\u003c')})`;
}
