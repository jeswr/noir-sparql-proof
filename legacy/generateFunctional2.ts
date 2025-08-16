import fs from "fs";
import { Algebra, Factory, translate } from "sparqlalgebrajs";
import { DataFactory as DF } from "n3";
import { getTermEncodings, getTermEncodingString, hash2, hash4 } from "./encode.js";
import { simplifyExpression, simplifyExpressionEBV } from "./expressionSimplifier.js";
import { optimizeExpression } from "./optimize.js";
import { getIndex } from "./termId.js";
import { operator as equivalentOperators } from "./equivalentOperators.js";
import { BindConstraint, CircomTerm, Computed, ComputedBinary, ComputedBinaryType, Constraint, Static, Var } from "./types.js";
import { SparqlOperator, Operator } from "@comunica/utils-expression-evaluator";
import { create } from "domain";


function filter(op: Algebra.Filter): OutInfo {
  const { expression, input } = op;
  const res = operation(input);
  return {
    inputPatterns: res.inputPatterns,
    binds: res.binds,
    constraint: {
      type: "all",
      constraints: [
        res.constraint,
        constraintExpression(expression),
      ],
    },
    optionalPatterns: res.optionalPatterns,
  };
}

interface OutInfo {
  inputPatterns: Algebra.Pattern[];
  optionalPatterns: Algebra.Pattern[];
  binds: BindConstraint[];
  constraint: Constraint;
}

function handlePatterns(patterns: (Algebra.Pattern | Algebra.Path)[]): OutInfo {
  const variables: Set<string> = new Set();
  const constraints: (Constraint | BindConstraint)[] = [];
  const outputPatterns: Algebra.Pattern[] = [];
  const optionalPatterns: Algebra.Pattern[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];

    if (pattern.graph.termType !== "DefaultGraph") {
      throw new Error("Expected a default graph");
    }

    if (pattern.type === Algebra.types.PATH) {
      if (pattern.predicate.type === "ZeroOrOnePath") {
        if (pattern.predicate.path.type !== Algebra.types.LINK) {
          console.warn("ZeroOrOnePath is not supported, skipping", pattern);
          continue;
        }

        optionalPatterns.push(
          (new Factory()).createPattern(
            pattern.subject,
            pattern.predicate.path.iri,
            pattern.object,
            pattern.graph,
          )
        );
        constraints.push({
          type: "some",
          constraints: [
            // CASE 1: ZERO PATH - SUBJECT AND OBJECT VARIABLE ARE THE SAME
            {
              type: "=",
              left: { type: "variable", value: pattern.subject.value },
              // FIX: REFERENCE THE OPTIONAL INPUT PATTERN
              right: { type: "variable", value: pattern.object.value },
            },
            // CASE 2: ONE PATH - SUBJECT AND OBJECT VARIABLE ARE DIFFERENT
            // HERE WE NEED TO DO AN EQUALITY CHECK ON THE FULL TRIPLE
            {
              type: "all",
              constraints: [
                // TODO: FIX THE Is
                {
                  type: "=",
                  left: { type: "variable", value: pattern.subject.value },
                  right: { type: "input", value: [i, 0] },
                },
                {
                  type: "=",
                  // TODO: SEE WHAT PATHS OTHER THAN LINK EXIST AND PROPERLY TYPE CHECK
                  left: { type: "static", value: pattern.predicate.path.iri },
                  right: { type: "input", value: [i, 1] },
                },
                {
                  type: "=",
                  left: { type: "variable", value: pattern.object.value },
                  right: { type: "input", value: [i, 2] },
                },
              ],
            }
          ],
        });
        constraints.push({
          type: "=",
          left: { type: "variable", value: pattern.object.value },
          right: { type: "input", value: [i, 2] },
        });
        // TODO: REMOVE ALL BINDS AND MAKE THEM EQUALITY CONSTRAINTS; THEN WE CAN JUST
        // SUPPLY THESE VALUES TO THE CIRCUIT AND THE ABOVE EQUALITY CONSTRAINTS WILL BE
        // WILL BE VALID
        continue;
      } else {
        // TODO: Make this return to an error condition
        console.warn("Unsupported operation: " + pattern.type);
        continue;
        // throw new Error("Unsupported operation: " + pattern.type);
      }
    }

    outputPatterns.push(pattern);

    for (let j = 0; j < 3; j++) {
      const term = pattern[(['subject', 'predicate', 'object'] as const)[j]];

      if (term.termType === "Variable") {
        constraints.push({
          type: variables.has(term.value) ? "=" : "bind",
          left: { type: "variable", value: term.value },
          right: { type: "input", value: [i, j] },
        });
        variables.add(term.value);
      } else if (term.termType === "NamedNode" || term.termType === "Literal") {
        constraints.push({
          type: "=",
          left: { type: "static", value: term },
          right: { type: "input", value: [i, j] },
        });
      } else {
        throw new Error("Unexpected term type: " + term.termType);
      }
    }
  }

  return {
    inputPatterns: outputPatterns,
    optionalPatterns: optionalPatterns,
    binds: constraints.filter((c): c is BindConstraint => c.type === "bind"),
    constraint: {
      type: "all",
      constraints: constraints.filter((c): c is Constraint => c.type !== "bind"),
    },
  };
}

function bgp(op: Algebra.Bgp): OutInfo {
  return handlePatterns(op.patterns);
}

function extend(op: Algebra.Extend): OutInfo {
  const { input, expression } = op;
  const res = operation(input);
  return {
    ...res,
    binds: [
      ...res.binds,
      {
        type: "bind",
        left: { type: "variable", value: op.variable.value },
        right: valueExpression(expression),
      },
    ],
  };
}

function join(op: Algebra.Join): OutInfo {
  const patterns: (Algebra.Pattern | Algebra.Path)[] = [];

  for (const i of op.input) {
    switch (i.type) {
      case Algebra.types.PATH:
        patterns.push(i);
        break;
      case Algebra.types.BGP:
        patterns.push(...i.patterns);
        break;
      case Algebra.types.EXTEND:
        console.warn("perfomring nop");
        // patterns.push();
        break;
      default:
        throw new Error("Unsupported operation: " + i.type);
    }
  }

  return handlePatterns(patterns);
}

function operation(op: Algebra.Operation): OutInfo {
  switch (op.type) {
    case Algebra.types.FILTER: return filter(op);
    case Algebra.types.BGP: return bgp(op);
    case Algebra.types.EXTEND: return extend(op);
    case Algebra.types.JOIN: return join(op);
    default:
      throw new Error(`Unsupported operation: ${op.type}`);
  }
}

function topLevel(op: Algebra.Operation) {
  switch (op.type) {
    case Algebra.types.PROJECT: return project(op);
    default:
      throw new Error(`Unsupported top level operation: ${op.type}`);
  }
}

interface ProjectInfo extends OutInfo {
  variables: string[];
}

function project(op: Algebra.Project): ProjectInfo {
  return {
    variables: op.variables.map(v => v.value),
    ...operation(op.input),
  }
}

interface CircuitOptions {
  termSize: number;
  version: string;
}

// Proposed approach:
// 1. Identify when terms from a given triple are needed at the top level.


// Main generation function
export function generateCircuit(queryFilePath: string = "./inputs/sparql.rq") {
  const query = fs.readFileSync(queryFilePath, "utf8");
  const translated = translate(query);
  let paths: Algebra.Path[] = [];
  let expressions: Algebra.Expression;

  if (translated.type !== Algebra.types.PROJECT)
    throw new Error("Expected a Project operation at the top level");

  if (translated.input.type !== Algebra.types.FILTER)
    throw new Error("Expected a Filter operation as the input to the Project operation");




  translated.input.value = equivalentOperators(translated.input.type === 'join' ? translated.input : translated.input);



  // Get an optimized set of constraints
  const topLevelConstraint = optimizeExpression(state.constraint);

  for (const c of topLevelConstraint.type === "all" ? topLevelConstraint.constraints : [topLevelConstraint])
    constraints.push(createConstraint(c));

  let output = 'use crate::types::Triple;\n\n';

  output += `pub(crate) type BGP = [Triple; ${state.inputPatterns.length}];\n`;
  if (hiddenInputs.length > 0)
    output += `pub(crate) type Hidden = [Field; ${hiddenInputs.length}];\n`;

  output += `pub(crate) struct Variables {\n`;
  for (const variable of state.variables) {
    output += `  pub(crate) ${variable}: Field,\n`;
  }
  output += `}\n\n`;

  output += `pub(crate) fn checkBinding(bgp: BGP, variables: Variables${hiddenInputs.length > 0 ? ', hidden: Hidden' : ''}) {\n`;

  for (const constraint of constraints) {
    output += `  assert(${constraint});\n`;
  }

  output += `}\n`;
  return {
    circuit: output,
    main: fs.readFileSync("./template/main-verify.template.nr", "utf8")
      .replace("{{h0}}", hiddenInputs.length > 0 ? ", Hidden" : "")
      .replace("{{h1}}", hiddenInputs.length > 0 ? ",\n    hidden: Hidden" : "")
      .replace("{{h2}}", hiddenInputs.length > 0 ? ", hidden" : "")
      .replace("{{hash2}}", hash2)
      .replace("{{hash4}}", hash4),
    metadata: {
      variables: state.variables,
      inputPatterns: state.inputPatterns,
      optionalPatterns: state.optionalPatterns,
      hiddenInputs: hiddenInputs,
    },
  };
}

// Run the generator if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { circuit, metadata, main } = generateCircuit();
  fs.writeFileSync("./noir_prove/src/sparql.nr", circuit);
  fs.writeFileSync("./noir_prove/src/main.nr", main);
  fs.writeFileSync("./noir_prove/metadata.json", JSON.stringify(metadata, null, 2));
  // fs.writeFileSync("circuits/artefacts/query.json", JSON.stringify(metadata, null, 2));
}
