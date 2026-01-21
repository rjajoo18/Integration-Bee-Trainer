declare module "react-katex" {
  import * as React from "react";

  export interface KaTeXProps {
    math: string;
    errorColor?: string;
    renderError?: (error: Error) => React.ReactNode;
    settings?: Record<string, unknown>;
  }

  export const BlockMath: React.FC<KaTeXProps>;
  export const InlineMath: React.FC<KaTeXProps>;
}
