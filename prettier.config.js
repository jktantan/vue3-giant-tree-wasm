/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
export default {
  //  在语句的末尾打印分号
  semi: false,

  //  使用单引号而不是双引号
  singleQuote: true,

  eslintIntegration: true,
  //  在唯一的箭头函数参数周围包含括号。
  //  "always"- 始终包括括号。例子：(x) => x
  //  "avoid"- 尽可能省略括号。例子：x => x
  arrowParens: 'avoid',

  //   在多行逗号分隔的句法结构中尽可能打印尾随逗号
  //   "es5"- 在 ES5 中有效的尾随逗号（对象、数组等）。TypeScript 中的类型参数中没有尾随逗号。
  //   "none"- 没有尾随逗号。
  //   "all"- 尽可能使用尾随逗号（包括函数参数和调用）。要运行，以这种方式格式化的 JavaScript 代码需要一个支持 ES2017（Node.js 8+ 或现代浏览器）或下级编译的引擎。这还可以在 TypeScript 中的类型参数中启用尾随逗号（自 2018 年 1 月发布的 TypeScript 2.7 起支持）。
  trailingComma: 'es5',
  //  行结束
  //  "lf"– 仅换行 ( \n)，常见于 Linux 和 macOS 以及 git repos 内部
  //  "crlf"- 回车 + 换行字符 ( \r\n)，常见于 Windows
  //  "cr"- 仅回车字符 ( \r)，很少使用
  //  "auto"- 保持现有的行尾（一个文件中的混合值通过查看第一行之后使用的内容进行标准化）
  endOfLine: 'lf',
  jsxBracketSameLine: true,
  plugins: ['assemblyscript-prettier'],
}
