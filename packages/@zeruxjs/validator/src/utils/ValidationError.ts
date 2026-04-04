import type {
  BaseIssue,
  BaseSchema,
  BaseSchemaAsync,
  InferIssue,
} from '../types/index.js';

/**
 * A error with useful information.
 */
export class ValidationError<
  TSchema extends
  | BaseSchema<unknown, unknown, BaseIssue<unknown>>
  | BaseSchemaAsync<unknown, unknown, BaseIssue<unknown>>,
> extends Error {
  /**
   * The error issues.
   */
  public readonly issues: [InferIssue<TSchema>, ...InferIssue<TSchema>[]];

  /**
   * Creates a error with useful information.
   *
   * @param issues The error issues.
   */
  // @__NO_SIDE_EFFECTS__
  constructor(issues: [InferIssue<TSchema>, ...InferIssue<TSchema>[]]) {
    super(issues[0].message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}
