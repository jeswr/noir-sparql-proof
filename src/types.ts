import { Term } from "@rdfjs/types";
import { SparqlOperator } from "@comunica/utils-expression-evaluator";
import { Algebra } from "sparqlalgebrajs";

// Simplified constraint types that work directly with Algebra expressions
export interface Constraint {
  type: "all" | "some" | "not" | "=" | "binary" | "boolean";
  constraints?: Constraint[];
  constraint?: Constraint;
  left?: Algebra.TermExpression;
  right?: Algebra.TermExpression;
  operator?: SparqlOperator;
  value?: boolean;
}

// Legacy types for backward compatibility - these should be phased out
export interface Var {
  type: "variable";
  value: string;
}

export interface Static {
  type: "static";
  value: Term;
}

export interface Computed {
  type: "computed";
  input: Algebra.TermExpression;
  computedType: SparqlOperator;
}

export interface ComputedBinary {
  type: "computedBinary";
  left: Algebra.TermExpression;
  right: Algebra.TermExpression;
  computedType: SparqlOperator;
}

export interface BindConstraint {
  type: "bind";
  left: Var;
  right: Algebra.TermExpression;
}
