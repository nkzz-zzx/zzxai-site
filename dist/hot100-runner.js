(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hot100Runner = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const LANGUAGES = {
    python: {
      label: 'Python 3.12', mode: 'python', extension: 'py', compiler: 'cpython-3.12.7',
      template: 'import sys\n\ndef solve():\n    # 每次调用处理一例；在函数内初始化本例状态，全局变量会跨用例保留。\n    # 使用 input() / sys.stdin 读取，print() 输出。\n    raise NotImplementedError("请先实现 solve")\n'
    },
    javascript: {
      label: 'JavaScript · Node.js 20', mode: 'javascript', extension: 'js', compiler: 'nodejs-20.17.0',
      template: 'function solve(input) {\n  // input 是当前用例的完整输入字符串；返回答案字符串，或用 console.log 输出。\n  // 在函数内初始化本例状态，全局变量会跨用例保留。\n  // 例如：const tokens = input.trim().split(/\\s+/);\n  throw new Error("请先实现 solve");\n}\n'
    },
    cpp: {
      label: 'C++ 17', mode: 'text/x-c++src', extension: 'cpp', compiler: 'gcc-13.2.0',
      template: '#include <iostream>\n#include <stdexcept>\n#include <vector>\n\nvoid Solve() {\n  // 每次调用处理一例；在函数内初始化本例状态，全局/静态变量会跨用例保留。\n  // 使用 std::cin 读取，std::cout 输出。\n  throw std::runtime_error("请先实现 Solve");\n}\n'
    },
    java: {
      label: 'Java 21', mode: 'text/x-java', extension: 'java', compiler: 'openjdk-jdk-21+35',
      template: 'import java.util.*;\n\nclass Solution {\n    public static void solve(Scanner in) {\n        // 每次调用处理一例；在函数内初始化本例状态，静态变量会跨用例保留。\n        // 使用 in 读取，System.out 输出。\n        throw new UnsupportedOperationException("请先实现 solve");\n    }\n}\n'
    },
    go: {
      label: 'Go 1.23', mode: 'go', extension: 'go', compiler: 'go-1.23.2',
      template: 'package main\n\nimport "bufio"\n\nfunc Solve(in *bufio.Reader, out *bufio.Writer) {\n\t// 每次调用处理一例；在函数内初始化本例状态，全局变量会跨用例保留。\n\t// 从 in 读取，向 out 写入；使用 fmt.Fscan/Fprintln 时请导入 "fmt"。\n\t// 无需编写 main。\n\tpanic("请先实现 Solve")\n}\n'
    }
  };

  function marker(token, index, kind) {
    return `__HOT100_${token}_${index}_${kind}__`;
  }

  function validateCases(cases, token) {
    if (!Array.isArray(cases) || !cases.length || cases.length > 100) throw new Error('请选择 1–100 个测试用例。');
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(token)) throw new Error('运行标识无效，请重新运行。');
    for (const item of cases) {
      if (!item || typeof item.input !== 'string' || typeof item.expected !== 'string') throw new Error('测试用例必须包含文本输入和预期输出。');
    }
  }

  function buildRequest(language, code, cases, token) {
    if (!Object.hasOwn(LANGUAGES, language)) throw new Error('不支持此语言。');
    if (typeof code !== 'string' || !code.trim()) throw new Error('请先填写代码。');
    validateCases(cases, token);
    const inputs = cases.map(item => item.input);
    const literal = value => JSON.stringify(value);
    const request = { compiler: LANGUAGES[language].compiler, code: '', stdin: '', options: '', save: false };
    if (language === 'python') {
      request.code = `${code}\n\nimport io as _hot100_io\nimport sys as _hot100_sys\nimport json as _hot100_json\n_hot100_inputs = _hot100_json.loads(${literal(JSON.stringify(inputs))})\nfor _hot100_i, _hot100_input in enumerate(_hot100_inputs):\n    _hot100_old_in, _hot100_old_out = _hot100_sys.stdin, _hot100_sys.stdout\n    _hot100_buffer = _hot100_io.StringIO()\n    try:\n        _hot100_sys.stdin = _hot100_io.StringIO(_hot100_input)\n        _hot100_sys.stdout = _hot100_buffer\n        solve()\n    finally:\n        _hot100_sys.stdin, _hot100_sys.stdout = _hot100_old_in, _hot100_old_out\n    print(${literal(`__HOT100_${token}_`)} + str(_hot100_i) + "_BEGIN__")\n    print(_hot100_buffer.getvalue(), end="")\n    print("\\n" + ${literal(`__HOT100_${token}_`)} + str(_hot100_i) + "_END__")\n`;
    } else if (language === 'javascript') {
      request.code = `${code}\n\n(async () => {\n  const inputs = ${literal(inputs)};\n  const write = process.stdout.write.bind(process.stdout);\n  for (let i = 0; i < inputs.length; i++) {\n    write(${literal(`__HOT100_${token}_`)} + i + '_BEGIN__\\n');\n    const result = await solve(inputs[i]);\n    if (result !== undefined) process.stdout.write(String(result));\n    write('\\n' + ${literal(`__HOT100_${token}_`)} + i + '_END__\\n');\n  }\n})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });\n`;
    } else if (language === 'cpp') {
      request.options = 'c++17';
      request.code = `#include <iostream>\n#include <sstream>\n#include <string>\n#include <vector>\n${code}\n\nint main() {\n  std::ios::sync_with_stdio(false);\n  const std::vector<std::string> inputs = {${inputs.map(literal).join(',')}};\n  for (std::size_t i = 0; i < inputs.size(); ++i) {\n    std::istringstream input(inputs[i]);\n    std::ostringstream output;\n    auto* old_input = std::cin.rdbuf(input.rdbuf());\n    auto* old_output = std::cout.rdbuf(output.rdbuf());\n    std::cin.clear();\n    std::cout.clear();\n    Solve();\n    std::cout.flush();\n    std::cin.rdbuf(old_input);\n    std::cout.rdbuf(old_output);\n    std::cin.clear();\n    std::cout.clear();\n    std::cout << ${literal(`__HOT100_${token}_`)} << i << "_BEGIN__\\n"\n              << output.str() << "\\n" << ${literal(`__HOT100_${token}_`)} << i << "_END__\\n";\n  }\n}\n`;
    } else if (language === 'java') {
      request.code = `${code}\n\nclass Wandbox {\n    public static void main(String[] args) throws Exception {\n        String[] inputs = {${inputs.map(literal).join(',')}};\n        java.io.PrintStream original = System.out;\n        for (int i = 0; i < inputs.length; i++) {\n            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();\n            try (java.util.Scanner in = new java.util.Scanner(inputs[i]);\n                 java.io.PrintStream output = new java.io.PrintStream(buffer, true, java.nio.charset.StandardCharsets.UTF_8)) {\n                System.setOut(output);\n                Solution.solve(in);\n            } finally {\n                System.setOut(original);\n            }\n            original.println(${literal(`__HOT100_${token}_`)} + i + "_BEGIN__");\n            original.print(buffer.toString(java.nio.charset.StandardCharsets.UTF_8));\n            original.println("\\n" + ${literal(`__HOT100_${token}_`)} + i + "_END__");\n        }\n    }\n}\n`;
    } else {
      request.code = code;
      request.codes = [{ file: 'hot100_driver.go', code: `package main\n\nimport (\n    "bufio"\n    "bytes"\n    "fmt"\n    "strings"\n)\n\nfunc main() {\n    inputs := []string{${inputs.map(literal).join(',')}}\n    for i, input := range inputs {\n        var buffer bytes.Buffer\n        out := bufio.NewWriter(&buffer)\n        Solve(bufio.NewReader(strings.NewReader(input)), out)\n        out.Flush()\n        fmt.Printf(${literal(`__HOT100_${token}_%d_BEGIN__\n`)}, i)\n        fmt.Print(buffer.String())\n        fmt.Printf(${literal(`\n__HOT100_${token}_%d_END__\n`)}, i)\n    }\n}\n` }];
    }
    return request;
  }

  const tokens = value => String(value).trim().split(/\s+/).filter(Boolean);
  const equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
  const lines = value => String(value).trim().split(/\r?\n/).map(line => tokens(line).join(' ')).filter(Boolean);

  function balancedBST(actual, input) {
    const source = tokens(input);
    if (!source.length || !/^\d+$/.test(source[0])) return false;
    const count = Number(source[0]);
    if (source.length !== count + 1) return false;
    const expected = source.slice(1).map(Number);
    if (expected.some(value => !Number.isSafeInteger(value))) return false;
    const text = String(actual).trim();
    let values;
    if (text.startsWith('[')) {
      try { values = JSON.parse(text); } catch (_) { return false; }
      if (!Array.isArray(values)) return false;
    } else {
      values = tokens(text).map(value => value === 'null' ? null : /^-?\d+$/.test(value) ? Number(value) : NaN);
    }
    if (values.some(value => value !== null && !Number.isSafeInteger(value))) return false;
    if (!values.length || values[0] === null) return count === 0 && values.every(value => value === null);
    if (values.length > 2 * count + 1) return false;
    const root = { value: values[0] }, queue = [root];
    let cursor = 1;
    for (let index = 0; index < queue.length && cursor < values.length; index++) {
      for (const side of ['left', 'right']) {
        if (cursor >= values.length) break;
        const value = values[cursor++];
        if (value !== null) {
          queue[index][side] = { value };
          queue.push(queue[index][side]);
        }
      }
    }
    if (cursor !== values.length || queue.length !== count) return false;
    const inorder = [], stack = [[root, false]], heights = new Map();
    while (stack.length) {
      const [node, visited] = stack.pop();
      if (!node) continue;
      if (!visited) {
        stack.push([node, true], [node.right, false], [node.left, false]);
      } else {
        const left = heights.get(node.left) || 0, right = heights.get(node.right) || 0;
        if (Math.abs(left - right) > 1) return false;
        heights.set(node, 1 + Math.max(left, right));
      }
    }
    let node = root;
    const path = [];
    while (node || path.length) {
      while (node) { path.push(node); node = node.left; }
      node = path.pop(); inorder.push(node.value); node = node.right;
    }
    return equal(inorder, expected);
  }

  function compareOutput(actual, expected, comparison = 'tokens', input = '') {
    if (comparison === 'tokens') return equal(tokens(actual), tokens(expected));
    if (comparison === 'unorderedTokens') return equal(tokens(actual).sort(), tokens(expected).sort());
    if (comparison === 'unorderedLines') return equal(lines(actual).sort(), lines(expected).sort());
    if (comparison === 'unorderedGroups') {
      const groups = value => lines(value).map(line => tokens(line).sort().join(' ')).sort();
      return equal(groups(actual), groups(expected));
    }
    if (comparison === 'float') {
      const a = tokens(actual).map(Number), b = tokens(expected).map(Number);
      return a.length === b.length && a.every((value, index) => Number.isFinite(value) && Number.isFinite(b[index]) && Math.abs(value - b[index]) <= 1e-6);
    }
    if (comparison === 'palindrome') {
      const value = String(actual).trim(), chars = [...value], source = String(input).replace(/\r?\n$/, '');
      return chars.length === [...String(expected).trim()].length && source.includes(value) && chars.every((char, index) => char === chars[chars.length - index - 1]);
    }
    if (comparison === 'balancedBST') return balancedBST(actual, input);
    throw new Error(`未知的输出比较方式：${comparison}`);
  }

  function parseResults(response, cases, token) {
    validateCases(cases, token);
    const stdout = typeof response?.program_output === 'string' ? response.program_output : '';
    const stderr = typeof response?.program_error === 'string' ? response.program_error : '';
    const compilerOutput = [response?.compiler_output, response?.compiler_error].filter(value => typeof value === 'string').join('');
    function fail(message) {
      const error = new Error(message);
      Object.assign(error, { stdout, stderr, compilerOutput });
      throw error;
    }
    if (!response || typeof response !== 'object') fail('运行服务返回了无效结果。');
    if (response.signal) fail(`程序被中止：${response.signal}`);
    if (response.status !== '0') {
      if (!response.status) fail('程序未正常完成，可能超时或达到服务资源限制。');
      fail(`编译或运行失败（退出码 ${response.status}），请查看错误输出。`);
    }
    if (typeof response.program_output !== 'string') fail('运行服务未返回标准输出。');
    const normalized = stdout.replace(/\r\n/g, '\n');
    let cursor = 0;
    const results = cases.map((item, index) => {
      const start = marker(token, index, 'BEGIN') + '\n';
      if (!normalized.startsWith(start, cursor)) fail('输出协议错误：用例边界缺失，请保留指定函数入口并在函数内输出。');
      cursor += start.length;
      const end = '\n' + marker(token, index, 'END') + '\n';
      const endIndex = normalized.indexOf(end, cursor);
      if (endIndex < 0) fail('输出协议错误：用例未完成或输出被截断。');
      const output = normalized.slice(cursor, endIndex);
      cursor = endIndex + end.length;
      return { name: item.name || `用例 ${index + 1}`, output, expected: item.expected, passed: compareOutput(output, item.expected, item.comparison || 'tokens', item.input) };
    });
    if (cursor !== normalized.length) fail('输出协议错误：用例之外还有额外输出。');
    return { results, stdout, stderr, compilerOutput };
  }

  return { LANGUAGES, buildRequest, parseResults, compareOutput };
});
