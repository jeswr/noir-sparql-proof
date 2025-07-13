import { Term } from "@rdfjs/types";
import fs from "fs";
import { DataFactory as DF } from "n3";
import { Algebra, Factory, translate } from "sparqlalgebrajs";
import { getIndex } from "./termId.js";
import { xsd } from "./xsd.js";
import { getTermEncodings } from "./encode.js";

type CircomTerm = Var | Input | Static | Computed | ComputedBinary;

interface Var {
  type: "variable";
  value: string;
}

interface Input {
  type: "input";
  value: [number, number];
}

interface Static {
  type: "static";
  value: Term;
}

enum ComputedType {
  IS_LITERAL = "isliteral",
  IS_IRI = "isiri",
  IS_BLANK = "isblank",
  LANG = "lang",
}

enum ComputedBinaryType {
  EQUAL = "equal",
}

interface Computed {
  type: "computed";
  input: CircomTerm;
  computedType: ComputedType;
}

interface ComputedBinary {
  type: "computedBinary";
  left: CircomTerm;
  right: CircomTerm;
  computedType: ComputedBinaryType;
}

interface BindConstraint {
  type: "bind";
  left: Var;
  right: CircomTerm;
}

interface EqConstraint {
  type: "=";
  left: CircomTerm;
  right: CircomTerm;
}

interface AllConstraint {
  type: "all";
  constraints: Constraint[];
}

interface SomeConstraint {
  type: "some";
  constraints: Constraint[];
}

interface NotConstraint {
  type: "not";
  constraint: Constraint;
}

interface UnaryCheckConstraint {
  type: "unary";
  constraint: CircomTerm;
  operator: "isiri" | "isblank";
}

type Constraint = EqConstraint | AllConstraint | SomeConstraint | NotConstraint | UnaryCheckConstraint;

function literalConstraint(constraint: CircomTerm): Constraint {
  return {
    type: "not",
    constraint: {
      type: "some",
      constraints: [
        {
          type: "unary",
          constraint: constraint,
          operator: "isiri",
        },
        {
          type: "unary",
          constraint: constraint,
          operator: "isblank",
        },
      ],
    },
  }
}

function operator(op: Algebra.OperatorExpression): Constraint {
  switch (op.operator) {
    case "&&": return { type: "all", constraints: op.args.map(constraintExpression) };
    case "||": return { type: "some", constraints: op.args.map(constraintExpression) };
    // TODO: Make sure this is correct insofar as numerics are concerned and expressions like FILTER(isLITERAL(?friend) == true)
    case "=":
      if (op.args.length !== 2) throw new Error("Expected two arguments for =");
      return { type: "=", left: valueExpression(op.args[0]), right: valueExpression(op.args[1]) };
    case "!=": return { type: "not", constraint: operator({ ...op, operator: "=" }) };
    case "!": 
      if (op.args.length !== 1) throw new Error("Expected one argument for !");
      return { type: "not", constraint: constraintExpression(op.args[0]) };
    case "isiri":
    case "isblank":
      if (op.args.length !== 1) throw new Error(`Expected one argument for ${op.operator}`);
      return { type: "unary", constraint: valueExpression(op.args[0]), operator: op.operator };
    case "isliteral":
      if (op.args.length !== 1) throw new Error(`Expected one argument for ${op.operator}`);
      return literalConstraint(valueExpression(op.args[0]));
    default:
      throw new Error(`Unsupported operator: ${op.operator}`);
  }
}

function valueExpression(op: Algebra.Expression): Var | Static | Computed | ComputedBinary {
  switch (op.expressionType) {
    case Algebra.expressionTypes.TERM: return termExpression(op);
    case Algebra.expressionTypes.OPERATOR:
      switch (op.operator) {
        case "isliteral":
          return { type: "computed", input: valueExpression(op.args[0]), computedType: ComputedType.IS_LITERAL };
        case "isiri":
          return { type: "computed", input: valueExpression(op.args[0]), computedType: ComputedType.IS_IRI };
        case "isblank":
          return { type: "computed", input: valueExpression(op.args[0]), computedType: ComputedType.IS_BLANK };
        case "lang":
          return { type: "computed", input: valueExpression(op.args[0]), computedType: ComputedType.LANG };
        case "=":
          if (op.args.length !== 2) throw new Error("Expected two arguments for =");
          return { type: "computedBinary", left: valueExpression(op.args[0]), right: valueExpression(op.args[1]), computedType: ComputedBinaryType.EQUAL };
        default:
          throw new Error(`Unsupported operator: ${op.operator}`);
      }
    default:
      throw new Error(`Unsupported expression: [${op.expressionType}]\n${JSON.stringify(op, null, 2)}`);
  }
}

function termExpression(op: Algebra.TermExpression): Var | Static {
  switch (op.term.termType) {
    case "Literal": return { type: "static", value: op.term };
    case "Variable": return { type: "variable", value: op.term.value };
    default:
      throw new Error(`Unsupported term type: ${op.term.termType}`);
  }
}

function constraintExpression(op: Algebra.Expression): Constraint {
  switch (op.expressionType) {
    case Algebra.expressionTypes.OPERATOR: return operator(op);
    default:
      throw new Error(`Unsupported expression: ${op.expressionType}`);
  }
}

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
        throw new Error("Unsupported operation: " + pattern.type);
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

function expression(op: Algebra.Expression) {
  switch (op.expressionType) {
    default:
      throw new Error(`Unsupported expression: ${op.expressionType}`);
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

function hashTerm(term: CircomTerm): string {
  switch (term.type) {
    case "variable": return term.value;
    case "input": return `input[${term.value[0]}]`;
    case "static": return `static[${getIndex(term.value).join(",")}]`;
    case "computed": return `computed[${hashTerm(term.input)}][${term.computedType}]`;
    case "computedBinary": return `computedBinary[${hashTerm(term.left)}][${hashTerm(term.right)}][${term.computedType}]`;
  }
}

function hashConstraint(left: Constraint): string {
  switch (left.type) {
    case "all":
      return 'all(' + left.constraints.map(hashConstraint).sort().join(",") + ')';
    case "some":
      return 'some(' + left.constraints.map(hashConstraint).sort().join(",") + ')';
    case "not":
      return 'not(' + hashConstraint(left.constraint) + ')';
    case "=":
      return '=(' + hashTerm(left.left) + ',' + hashTerm(left.right) + ')';
    case "unary":
      return left.operator + '(' + hashTerm(left.constraint) + ')';
  }
}

function computedToConstraint(right: Computed): Constraint | false {
  switch (right.computedType) {
    case ComputedType.IS_IRI:
    case ComputedType.IS_BLANK:
      return {
        type: "unary",
        constraint: right,
        operator: right.computedType,
      };
    case ComputedType.IS_LITERAL:
      return literalConstraint(right.input);
    case ComputedType.LANG:
      return false;
    default:
      throw new Error("Unsupported computed type: " + right.computedType);
  }
}

function optimize(constraint: Constraint): Constraint | 'true' | 'false' {
  switch (constraint.type) {
    case "all":
    case "some":
      const preConstraints = constraint.constraints.map(optimize);

      // Cases where we can short circuit
      if (constraint.type === "some" && preConstraints.some(c => c === 'true')) return 'true';
      if (constraint.type === "all" && preConstraints.some(c => c === 'false')) return 'false';

      // Remove short circuit values
      let constraints = preConstraints.filter((c): c is Constraint => c !== 'true' && c !== 'false');

      // Remove duplicate constraints
      const seen = new Set<string>();
      constraints = constraints.filter((c) => {
        const hash = hashConstraint(c);
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      });

      // In "all" constraints remove nested "some" constraints if part of the "some" constraint
      // is also present in the "all" constraint
      if (constraint.type === "all") {
        constraints = constraints.filter(
          c => c.type !== "some" || !c.constraints.some(c => seen.has(hashConstraint(c)))
        );
      }

      if (constraints.length === 1) return constraints[0];
      if (constraints.length === 0) return constraint.type === "all" ? 'true' : 'false';

      const flat: Constraint[] = [];
      for (const c of constraints) {
        if (c.type === constraint.type)
          flat.push(...c.constraints);
        else
          flat.push(c);
      }

      return {
        type: constraint.type,
        constraints: flat,
      };
    case "not":
      switch (constraint.constraint.type) {
        // Push the not as far down as possible
        case "all":
        case "some":
          return optimize({
            type: constraint.constraint.type === "all" ? "some" : "all",
            constraints: constraint.constraint.constraints.map(c => ({
              type: "not",
              constraint: c,
            })),
          });
        // Remove double negations
        case "not":
          return optimize(constraint.constraint.constraint);
        default:
          const optimised = optimize(constraint.constraint);
          if (optimised === 'true') return 'false';
          if (optimised === 'false') return 'true';
          return constraint;
      }
    case "=":
      const left = preCompute(constraint.left);
      const right = preCompute(constraint.right);

      // BEGIN PREPROCESSING THAT SHOULD BE REMOVED AND HANDLED EARLIER

      // TODO: Use (comunica?) to handle actual equality
      if (left.type === 'static' && right.type === 'static')
        return left.value.equals(right.value) ? 'true' : 'false';
        
      // TODO: HANDLE TERM NORMILISATION i.e. true, 1, True all need to be interpreted the same way
      // SEE IF SPARQL ALGEBRAJS ALREADY DOES THIS

      const isTrue = (term: Term) => term.equals(DF.literal("true", DF.namedNode(xsd.boolean))) || term.equals(DF.literal("1", DF.namedNode(xsd.boolean)));
      const isFalse = (term: Term) => term.equals(DF.literal("false", DF.namedNode(xsd.boolean))) || term.equals(DF.literal("0", DF.namedNode(xsd.boolean)));

      if (left.type === 'static' && right.type === 'computed') {
        const constraint = computedToConstraint(right);
        if (constraint) {
          if (isTrue(left.value))
            return optimize(constraint);
          if (isFalse(left.value))
            return optimize({ type: "not", constraint });
        }
      }

      if (right.type === 'static' && left.type === 'computed') {
        const constraint = computedToConstraint(left);
        if (constraint) {
          if (isTrue(right.value))
            return optimize(constraint);
          if (isFalse(right.value))
            return optimize({ type: "not", constraint });
        }
      }

      // END PREPROCESSING THAT SHOULD BE REMOVED AND HANDLED EARLIER

      return {
        type: "=",
        left: left,
        right: right,
      };
    case "unary":
      const input = preCompute(constraint.constraint);
      if (input.type === 'static') {
        switch (constraint.operator) {
          case "isiri":
            return input.value.termType === "NamedNode" ? 'true' : 'false';
          case "isblank":
            return input.value.termType === "BlankNode" ? 'true' : 'false';
          default:
            throw new Error("Unsupported unary operator: " + constraint.operator);
        }
      }
      return {
        type: "unary",
        constraint: input,
        operator: constraint.operator,
      };
    default:
      return constraint;
  }
}

function preCompute(constraint: CircomTerm): CircomTerm {
  switch (constraint.type) {
    case "variable": return constraint;
    case "input": return constraint;
    case "static": return constraint;
    case "computed": return constraint;
    case "computedBinary": return constraint;
  }
}

// Main generation function
export function generateCircuit(queryFilePath: string = "./inputs/sparql.rq", options: CircuitOptions = { termSize: 128, version: '2.1.2' }) {
  const query = fs.readFileSync(queryFilePath, "utf8");
  const state = topLevel(translate(query));

  let id = 0;
  let gateId = 0;
  const anonymousVariables: Record<string, string> = {};
  const constraints: string[] = [];
  const ands: Set<string> = new Set();
  const nots: Set<string> = new Set();
  const imports: Set<string> = new Set();

  for (const bind of state.binds) {
    if (!state.variables.includes(bind.left.value) && !(bind.left.value in anonymousVariables))
      // Rather than creating extra hidden variables, we just use the existing variable where possible
      anonymousVariables[bind.left.value] = serializeTerm(bind.right);
    else
      constraints.push(`${serializeTerm(bind.left)} == ${serializeTerm(bind.right, true)}`);
  }

  function serializeTerm(term: CircomTerm, assignment: boolean = false): string {
    switch (term.type) {
      case "static":
        return getTermEncodings([term.value])[0].toString();
      case "variable":
        if (state.variables.includes(term.value))
          return 'variables.' + term.value;
        else
          return anonymousVariables[term.value];
      case "input":
        return `bgp[${term.value[0]}].terms[${term.value[1]}]`;
      default:
        throw new Error(`Unsupported term type: ${term.type}`);
    }

    // switch (term.type) {
    //   case "variable":
        // if (state.variables.includes(term.value))
        //   return `pub[${state.variables.indexOf(term.value)}]`;
        // else
        //   return (anonymousVariables[term.value] ??= `hid[${id++}]`);
    //   case "input":  return `triples[${term.value[0]}][${term.value[1]}]`;
    //   case "static": return `[${getIndex(term.value).join(", ")}]`;
    //   // case "computed": 
    //   //   imports.add("./operators.circom");
    //   //   return `${term.computedType}()(${serializeTerm(term.input)})`;
    //   case "computed": 
    //     imports.add("./operators.circom");
    //     return writeAnonymous(`${term.computedType}()(${serializeTerm(term.input)})`, assignment);
    //   case "computedBinary":
    //     imports.add("./operators.circom");
    //     return writeAnonymous(`${term.computedType}()(${serializeTerm(term.left)}, ${serializeTerm(term.right)})`, assignment);
    // }
  }

  function createConstraint(constraint: Constraint): string {
    imports.add("circomlib/circuits/gates.circom");
    switch (constraint.type) {
      case "all":
      case "some":
        if (constraint.constraints.length === 0) throw new Error("Expected at least one constraint");
        return `(${constraint.constraints.map(createConstraint).join(constraint.type === "all" ? " && " : " || ")})`;
        // let res = createConstraint(constraint.constraints[0]);
        // for (let i = 1; i < constraint.constraints.length; i++)
        //   res = `${constraint.type === "all" ? "AND" : "OR"}()(${res}, ${createConstraint(constraint.constraints[i])})`;
        // return res;
      case "not":
        return `!(${createConstraint(constraint.constraint)})`;
        // return `NOT()(${createConstraint(constraint.constraint)})`;
      case "=":
        // TODO: Optimise this to use actual equality constraints
        return `${serializeTerm(constraint.left)} == ${serializeTerm(constraint.right)}`;
      case "unary":
        imports.add("circomlib/circuits/comparators.circom");
        switch (constraint.operator) {
          case "isiri":   return `${serializeTerm(constraint.constraint)}[0] == 0`;
          case "isblank": return `${serializeTerm(constraint.constraint)}[0] == 1`;
          // case "isiri":   return `IsEqual()([${serializeTerm(constraint.constraint)}[0], 0])`;
          // case "isblank": return `IsEqual()([${serializeTerm(constraint.constraint)}[0], 1])`;
          default:
            throw new Error("Unsupported unary operator: " + constraint.operator);
        }
      default:
        throw new Error("Unsupported constraint type: " + JSON.stringify(constraint, null, 2));
    }
  }

  function handleConstraint(constraint: Constraint): void {
    ands.add(createConstraint(constraint));
  }

  // Get an optimized set of constraints
  const topLevelConstraint = optimize(state.constraint);

  if (topLevelConstraint === 'true') {
    console.warn("Query has no filtering constraints");
  } else if (topLevelConstraint === 'false') {
    throw new Error("Query is unsatisfiable");
  } else if (topLevelConstraint.type === "all") {
    for (const c of topLevelConstraint.constraints) {
      switch (c.type) {
        case "=":
          constraints.push(`${serializeTerm(c.right)} == ${serializeTerm(c.left)}`)
          break;
        case "unary":
          switch (c.operator) {
            case "isiri":
              constraints.push(`${serializeTerm(c.constraint)}[0] === 0`);
              break;
            case "isblank":
              constraints.push(`${serializeTerm(c.constraint)}[0] === 1`);
              break;
            default:
              throw new Error("Unsupported unary operator: " + c.operator);
          }
          break;
        case "not":
          nots.add(createConstraint(c.constraint));
          break;
        default:
          handleConstraint(c);
      }
    }
  } else {
    handleConstraint(state.constraint);
  }

  // TODO: ASK IF THIS IS REQUIRED
  // constraints.push(...[...ands, ...nots].map((a, i) => `and[${i}] <== ${a}`));
  constraints.push(...[...ands, ...nots].map((a, i) => `and[${i}] <-- ${a}`));

  let output = 'use crate::triple::Triple;\n\n';

  output += `pub(crate) type BGP = [Triple; ${state.inputPatterns.length}];\n`;
  output += `pub(crate) struct Variables {\n`;
  for (const variable of state.variables) {
    output += `  pub(crate) ${variable}: Field,\n`;
  }
  output += `}\n\n`;

  output += `pub(crate) fn checkBinding(bgp: BGP, variables: Variables) {\n`;

  for (const constraint of constraints) {
    output += `  assert(${constraint});\n`;
  }

  // output += `  signal input triples[${state.inputPatterns.length}][3][${options.termSize}];\n`;
  // if (state.variables.length > 0)
  //   output += `  signal output pub[${state.variables.length}][${options.termSize}];\n`;
  // if (gateId > 0)
  //   output += `  signal gate[${gateId}];\n`;
  // if (id > 0)
  //   output += `  signal hid[${id}][${options.termSize}];\n`;
  // if (ands.size > 0 || nots.size > 0)
  //   output += `  signal and[${ands.size + nots.size}];\n`;
  // output += `\n`;
  // output += `  ${constraints.join(";\n  ")};\n`;
  // if (ands.size > 0 || nots.size > 0)
  //   output += `  and === [${[...Array(ands.size).fill(1), ...Array(nots.size).fill(0)].join(", ")}];\n`;
  output += `}\n`;
  return {
    circuit: output,
    metadata: {
      variables: state.variables,
      inputPatterns: state.inputPatterns,
      optionalPatterns: state.optionalPatterns,
    },
  };
}

// Run the generator if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { circuit, metadata } = generateCircuit();
  fs.writeFileSync("./noir_prove/src/sparql.nr", circuit);
  // fs.writeFileSync("circuits/artefacts/query.json", JSON.stringify(metadata, null, 2));
}
