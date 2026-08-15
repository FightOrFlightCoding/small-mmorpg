import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";

const extensions = [".mjs", ".js", ".ts", ".json"];

export default {
  input: "./src/main.ts",
  external: ["nakama-runtime"],
  plugins: [
    resolve({ extensions }),
    typescript({ tsconfig: "./tsconfig.json", noEmitOnError: true }),
    json(),
    commonjs({ extensions }),
    babel({
      extensions,
      babelHelpers: "bundled",
    }),
  ],
  output: {
    file: "build/index.js",
    format: "cjs",
    exports: "none",
    strict: false,
    generatedCode: "es5",
  },
};
