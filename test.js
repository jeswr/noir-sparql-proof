// Fetch the content of https://www.w3.org/TR/sparql11-query/ and parse the DOM

import { JSDOM } from 'jsdom';

const res = await fetch('https://www.w3.org/TR/sparql11-query/');
const text = await res.text();
const dom = new JSDOM(text, { url: 'https://www.w3.org/TR/sparql11-query/' });

const doc = dom.window.document;
console.log(doc.querySelector('h1').textContent); // Should log "SPARQL Query Language (SPARQL 1.1)"
