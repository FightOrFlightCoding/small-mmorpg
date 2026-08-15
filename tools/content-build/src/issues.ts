export interface ContentIssue {
  code: string;
}

export class ContentValidationError extends Error {
  readonly issues: ContentIssue[];

  constructor(issues: ContentIssue[]) {
    super(issues.map((issue) => issue.code).join("\n"));
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

export function issue(code: string): ContentIssue {
  return { code };
}
