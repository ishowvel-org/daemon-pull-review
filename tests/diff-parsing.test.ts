import { parsePerFileDiffs } from "../src/helpers/pull-helpers/pull-request-parsing";
import { expect, it, describe } from "@jest/globals";

const BUTTON_FILENAME = "src/components/Button.tsx";
const BUTTON_DIFF_CONTENT = `index abc1234..def5678 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,5 +1,6 @@
 import React from 'react';
+import { ButtonProps } from '../types';
 
-export const Button = ({ children }) => {
-  return <button>{children}</button>;
+export const Button = ({ children, variant = 'primary' }: ButtonProps) => {
+  return <button className={\`btn btn-\${variant}\`}>{children}</button>;
 };`;

const TYPES_FILENAME = "src/types/index.ts";
const TYPES_DIFF_CONTENT = `new file mode 100644
index abc1234..def5678
--- /dev/null
+++ b/src/types/index.ts
@@ -0,0 +1,4 @@
+export interface ButtonProps {
+  children: React.ReactNode;
+  variant?: 'primary' | 'secondary';
+}`;

// Construct the complete diff
const DEFAULT_DIFF = [
  `diff --git a/${BUTTON_FILENAME} b/${BUTTON_FILENAME}`,
  BUTTON_DIFF_CONTENT,
  `diff --git a/${TYPES_FILENAME} b/${TYPES_FILENAME}`,
  TYPES_DIFF_CONTENT,
].join("\n");

describe("parsePerFileDiffs", () => {
  it("should parse the default diff correctly", () => {
    const result = parsePerFileDiffs(DEFAULT_DIFF);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      filename: BUTTON_FILENAME,
      diffContent: `diff --git a/${BUTTON_FILENAME} b/${BUTTON_FILENAME}\n${BUTTON_DIFF_CONTENT}`,
    });
    expect(result[1]).toEqual({
      filename: TYPES_FILENAME,
      diffContent: `diff --git a/${TYPES_FILENAME} b/${TYPES_FILENAME}\n${TYPES_DIFF_CONTENT}`,
    });
  });

  it("should handle a single file diff", () => {
    const singleDiff = `diff --git a/${BUTTON_FILENAME} b/${BUTTON_FILENAME}\n${BUTTON_DIFF_CONTENT}`;
    const result = parsePerFileDiffs(singleDiff);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: BUTTON_FILENAME,
      diffContent: singleDiff,
    });
  });

  it("should handle empty input", () => {
    const result = parsePerFileDiffs("");
    expect(result).toHaveLength(0);
  });

  it("should handle diffs with no actual changes", () => {
    const unchangedFilename = "src/unchanged.ts";
    const unchangedDiff = `diff --git a/${unchangedFilename} b/${unchangedFilename}
index abc1234..def5678 100644
--- a/${unchangedFilename}
+++ b/${unchangedFilename}`;

    const result = parsePerFileDiffs(unchangedDiff);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: unchangedFilename,
      diffContent: unchangedDiff,
    });
  });
});
