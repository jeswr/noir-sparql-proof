import { SparqlOperator, declare, integer, string } from "@comunica/utils-expression-evaluator";

console.log(
  integer(1),
  string("test"),
  declare(SparqlOperator.STRLEN)
    .onStringly1(() => str => integer([ ...str.typedValue ].length))
    .collect(),
)
