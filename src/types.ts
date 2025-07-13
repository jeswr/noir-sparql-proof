import { Term } from "@rdfjs/types";
// @ts-ignore
import { AND, OR, simplify, NOT, TRUE, FALSE } from '@fordi-org/bsimp';

export type CircomTerm = Var | Input | Static | Computed | ComputedBinary;
export interface Var {
  type: "variable";
  value: string;
}
interface Input {
  type: "input";
  value: [number, number];
}
export interface Static {
  type: "static";
  value: Term;
}
export enum ComputedType {
  IS_LITERAL = "isliteral",
  IS_IRI = "isiri",
  IS_BLANK = "isblank",
  LANG = "lang"
}
export enum ComputedBinaryType {
  EQUAL = "equal"
}
export interface Computed {
  type: "computed";
  input: CircomTerm;
  computedType: ComputedType;
}
export interface ComputedBinary {
  type: "computedBinary";
  left: CircomTerm;
  right: CircomTerm;
  computedType: ComputedBinaryType;
}
export interface BindConstraint {
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
interface BooleanConstraint {
  type: "boolean";
  value: boolean;
}
export type Constraint = EqConstraint | AllConstraint | SomeConstraint | NotConstraint | UnaryCheckConstraint | BooleanConstraint;
