import fs from 'fs';
import { execSync } from 'child_process';
import { loadCompressedPublicKey } from './keygen.js';
import { getTermEncodingsStrings, getTermField, stringToFieldFn, specialLiteralHandling, run } from './dist/encode.js';
import { Store } from 'n3';
import { getBindings } from './dist/transform.js';
import json from './temp/main.json' with { type: 'json' };
import metadata from './noir_prove/metadata.json' with { type: 'json' };
import { stringQuadToQuad, termToString, stringToTerm } from 'rdf-string-ttl';
import { translate } from 'sparqlalgebrajs';
import { Noir } from '@noir-lang/noir_js';
import circuit from './noir_prove/target/noir_prove.json' with { type: 'json' };
import { UltraHonkBackend } from '@aztec/bb.js';

// Load pubKey buffer from hex string
const pubKey = Buffer.from(json.pubKey, 'hex');
const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

const quadArr = json.nquads.map(quad => stringQuadToQuad(quad));
const stringArr = quadArr.map(quad => termToString(quad));
const store = new Store(quadArr);

const noir = new Noir(circuit);

for await (const binding of getBindings(translate(fs.readFileSync('./inputs/sparql.rq').toString()), store, metadata.inputPatterns)) {
  
  console.log('Binding:', binding);

  const inputs = binding.bgp.map(t1 => stringArr.indexOf(termToString(t1)));
  const getTripleObject = (id) => {
    return {
      terms: json.triples[id],
      path: json.paths[id],
      directions: json.direction[id],
    };
  };


  let variables = {};
  for (const variable of binding.bindings.keys()) {
    variables[variable.value] = getTermEncodingsStrings([binding.bindings.get(variable)])[0];
  }

  const startTime = Date.now();
  console.time('WITNESS')

  const hidden = metadata.hiddenInputs.map(elem => {
      switch (elem.type) {
        case 'input':
          return BigInt(json.tripleFields[inputs[elem.value[0]]][elem.value[1]]).toString();
        case 'static':
          return getTermField([elem.value])[0];
        case 'customComputed':
          console.log('Custom computed input:', elem);
          const inputToTerm = elem.input.type === 'variable'
            ? binding.bindings.get(elem.input.value)
            // TODO: FIX
            : stringToTerm(json.nquads[inputs[elem.input.value[0]]][
                ['subject', 'predicate', 'object', 'graph'][elem.input.value[1]]
              ]);

          console.log('Input to term:', inputToTerm);

          if (inputToTerm.termType !== 'Literal') {
            throw new Error(`Custom computed input must be a literal, got ${inputToTerm.termType}`);
          }

          switch (elem.computedType) {
            case 'literal_value':
              return BigInt(run(stringToFieldFn(inputToTerm.value)).slice(1, -1)).toString();
            case 'special_handling':
              return BigInt(run(specialLiteralHandling(inputToTerm)).slice(1, -1)).toString();
            case 'literal_lang':
              return BigInt(run(stringToFieldFn(inputToTerm.language)).slice(1, -1)).toString();
          }
          throw new Error(`Custom computed type "${elem.computedType}" is not supported in this context.`);
        // case 'variable':
        //   // For language tag variables, we need to extract components from the source literal
        //   if (elem.value.startsWith('literal_value_')) {
        //     const langVarName = elem.value.replace('literal_value_', '');
        //     return stringToFieldFn(binding.bindings.get(langVarName).value);
        //   }
        //   if (elem.value.startsWith('special_handling_')) {
        //     const langVarName = elem.value.replace('special_handling_', '');
        //     return specialLiteralHandling(binding.bindings.get(langVarName));
        //   }
        default:
          throw new Error(`Unsupported hidden input type: ${elem.type}`);
      }
    })

  const input = {
    public_key_x: pairs.getPublic().getX().toArray(),
    public_key_y: pairs.getPublic().getY().toArray(),
    signature: Array.from(Buffer.from(json.signaure, 'hex')),
    root: json.root,
    bgp: inputs.map(i => getTripleObject(i)),
    variables,
    hidden: hidden
  }

  console.log('Hidden inputs:', input);

  const { witness } = await noir.execute(input);
  console.log(witness);
  // console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
  console.timeEnd('WITNESS')
  const backend = new UltraHonkBackend(circuit.bytecode);
  console.time('PROVING')
  const proof = await backend.generateProof(witness);
  console.timeEnd('PROVING')
  const endTime = Date.now();
  const provingTimeMs = endTime - startTime;

  // Save timing information
  const timingData = {
    provingTimeMs: provingTimeMs,
    provingTimeFormatted: `${(provingTimeMs / 1000).toFixed(2)}s`,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync('./temp/timing.json', JSON.stringify(timingData, null, 2));

  // Update README with latest timing
  // execSync('node update-readme-timing.js', { stdio: 'inherit' });
}